// ===========================================================================
// AskCENLA Repair Network — Stripe webhook
//
// The only thing that ever changes a contractor's membership status.
//
// This function does exactly two things the database cannot: it proves the
// request genuinely came from Stripe, and it turns Stripe's object shapes into
// the flat payload apply_subscription_event() expects. Everything that decides
// what a payment state MEANS — idempotency, out-of-order delivery, which
// status pauses routing, who gets told — is in SQL under test
// (supabase/migrations/0013_billing.sql, supabase/tests/08_billing_test.sql).
//
// Deploy:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...
//
// --no-verify-jwt is required: Stripe does not send a Supabase JWT. The
// signature check below is the authentication, and it must come first.
// ===========================================================================

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** Events that carry a subscription we care about. Anything else is ignored. */
const HANDLED = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'checkout.session.completed',
]);

function iso(seconds: number | null | undefined): string {
  return seconds ? new Date(seconds * 1000).toISOString() : '';
}

/**
 * Resolve which contractor an event belongs to.
 *
 * Preference order matters: metadata we set at checkout is the most reliable,
 * then the customer's metadata, then the subscription we already have on file.
 */
async function resolveContractorId(
  subscription: Stripe.Subscription,
  fallbackCustomerId: string | null,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.contractor_id;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : fallbackCustomerId;
  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.contractor_id) {
      return customer.metadata.contractor_id;
    }
  } catch {
    // Fall through to the database.
  }

  const { data } = await db
    .from('subscriptions')
    .select('contractor_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.contractor_id ?? null;
}

Deno.serve(async (request) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  // The raw body is required: any reserialisation invalidates the signature.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    // Async variant: Deno's SubtleCrypto has no synchronous HMAC.
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    // 200 so Stripe stops retrying something we deliberately ignore.
    return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });
  }

  try {
    let subscription: Stripe.Subscription | null = null;
    let customerId: string | null = null;

    if (event.type.startsWith('customer.subscription.')) {
      subscription = event.data.object as Stripe.Subscription;
    } else if (event.type.startsWith('invoice.')) {
      const invoice = event.data.object as Stripe.Invoice;
      customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      if (invoice.subscription) {
        const id =
          typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
        subscription = await stripe.subscriptions.retrieve(id);
      }
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      customerId = typeof session.customer === 'string' ? session.customer : null;
      if (session.subscription) {
        const id =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        subscription = await stripe.subscriptions.retrieve(id);
      }
    }

    if (!subscription) {
      return new Response(JSON.stringify({ ignored: 'no subscription on event' }), { status: 200 });
    }

    const contractorId = await resolveContractorId(subscription, customerId);

    const { data, error } = await db.rpc('apply_subscription_event', {
      p_event_id: event.id,
      p_type: event.type,
      p_created: new Date(event.created * 1000).toISOString(),
      p_contractor_id: contractorId,
      p_subscription: {
        id: subscription.id,
        customer:
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
        status: subscription.status,
        price_id: subscription.items.data[0]?.price?.id ?? null,
        current_period_start: iso(subscription.current_period_start),
        current_period_end: iso(subscription.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: iso(subscription.canceled_at),
      },
    });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ event: event.type, result: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Failed to apply event', event.id, err);
    // A non-2xx asks Stripe to retry. That is safe: apply_subscription_event
    // is idempotent on the event id, so a retry of something that partly
    // succeeded cannot apply it twice.
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
