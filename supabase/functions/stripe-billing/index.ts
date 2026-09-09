// ===========================================================================
// AskCENLA Repair Network — Stripe checkout and billing portal
//
// Called by a signed-in contractor from the Membership screen. Returns a URL
// to redirect to; it never touches membership state itself — that only ever
// changes in response to a verified webhook (see ../stripe-webhook).
//
// Deploy:
//   supabase functions deploy stripe-billing
//   supabase secrets set STRIPE_SECRET_KEY=... STRIPE_PRICE_ID=... APP_URL=...
//
// Note this one KEEPS JWT verification (unlike the email worker): the caller
// is a real signed-in user, and their identity is the whole point.
// ===========================================================================

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const PRICE_ID = Deno.env.get('STRIPE_PRICE_ID')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in' }, 401);

  // A client scoped to the CALLER's token, so every read below is filtered by
  // the same RLS policies the browser gets. The contractor being billed is
  // derived from that token and never from the request body — otherwise one
  // contractor could open a checkout session against another's account.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);

  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, email, contractor_id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!profile?.contractor_id) {
    return json({ error: 'Only a contractor account has a membership' }, 403);
  }

  const { data: contractor } = await db
    .from('contractors')
    .select('id, business_name, email')
    .eq('id', profile.contractor_id)
    .maybeSingle();

  if (!contractor) return json({ error: 'Contractor not found' }, 404);

  // Read-only here; the row is created and updated by the webhook.
  const { data: subscription } = await db
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('contractor_id', contractor.id)
    .maybeSingle();

  let mode: 'checkout' | 'portal' = 'checkout';
  try {
    const body = await request.json();
    if (body?.mode === 'portal') mode = 'portal';
  } catch {
    // Default is checkout.
  }

  try {
    // Reuse the Stripe customer if we have one, so a contractor who cancels
    // and returns keeps one billing history rather than accumulating customers.
    let customerId = subscription?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: contractor.email,
        name: contractor.business_name,
        metadata: { contractor_id: contractor.id },
      });
      customerId = customer.id;
    }

    if (mode === 'portal') {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/contractor/membership`,
      });
      return json({ url: session.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      // Both are read back by the webhook to identify the contractor without
      // trusting anything the browser sends at that point either.
      client_reference_id: contractor.id,
      subscription_data: { metadata: { contractor_id: contractor.id } },
      success_url: `${APP_URL}/contractor/membership?checkout=success`,
      cancel_url: `${APP_URL}/contractor/membership?checkout=cancelled`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Stripe request failed' }, 500);
  }
});
