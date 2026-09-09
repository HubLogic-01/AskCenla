// ===========================================================================
// AskCENLA Repair Network — notification email worker
//
// Deliberately thin. Everything that could be wrong in an interesting way —
// who gets emailed, when, what happens on failure, how a stranded message is
// recovered — lives in SQL (supabase/migrations/0011_email_delivery.sql) where
// it is covered by supabase/tests/07_notifications_test.sql.
//
// This file does one thing the database cannot: make an HTTPS call to an email
// provider. Swapping Resend for Postmark means changing `sendEmail` below and
// nothing else.
//
// Deploy:
//   supabase functions deploy send-notifications --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=...  CRON_SECRET=...  EMAIL_FROM=...
//
// `--no-verify-jwt` is deliberate: this is called by the database's scheduler,
// not by a signed-in user, so it authenticates on a shared secret instead. The
// service-role key lives in this function's own environment and never touches
// the database.
// ===========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Mode = 'immediate' | 'digest' | 'owner';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AskCENLA <notifications@askcenla.com>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://askcenla.netlify.app';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Matches the app's navy/blue palette, inlined because email has no stylesheets. */
function shell(heading: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#38424f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dbe1ea;border-radius:14px;overflow:hidden">
        <tr><td style="background:#0a1f3c;padding:18px 24px;color:#fff;font-weight:700;letter-spacing:-0.01em">
          AskCENLA <span style="opacity:.6;font-weight:500">Repair Network</span>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 16px;font-size:18px;color:#0a1f3c">${escapeHtml(heading)}</h1>
          ${inner}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f5f7fa;border-top:1px solid #dbe1ea;font-size:12px;color:#5b6675">
          You are receiving this because of activity on your AskCENLA account.
          Change how often you are emailed in the notifications menu.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(link: string | null): string {
  if (!link) return '';
  const href = `${APP_URL}${link}`;
  return `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1866bd;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600">Open in AskCENLA</a></p>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });

  if (!response.ok) {
    // Keep the provider's message: record_notification_delivery stores it, and
    // "Mailbox does not exist" is the difference between retrying and not.
    throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/** One email per notification, for recipients who asked for immediate delivery. */
async function sendImmediate(): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db.rpc('claim_notification_emails', { p_limit: 50 });
  if (error) throw new Error(`claim failed: ${error.message}`);

  let sent = 0;
  let failed = 0;

  for (const row of data ?? []) {
    try {
      await sendEmail(
        row.recipient_email,
        row.title,
        shell(row.title, `<p style="margin:0;font-size:15px;line-height:1.6">${escapeHtml(row.body)}</p>${button(row.link)}`),
      );
      await db.rpc('record_notification_delivery', {
        p_notification_id: row.notification_id,
        p_delivered: true,
      });
      sent++;
    } catch (err) {
      // Never throw out of the loop: one bad address must not block the queue.
      await db.rpc('record_notification_delivery', {
        p_notification_id: row.notification_id,
        p_delivered: false,
        p_error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { sent, failed };
}

/** One email per recipient, rolling up everything they held back. */
async function sendDigests(): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db.rpc('claim_notification_digests');
  if (error) throw new Error(`claim failed: ${error.message}`);

  let sent = 0;
  let failed = 0;

  for (const row of data ?? []) {
    const items = (row.items ?? []) as { title: string; body: string; link: string | null }[];
    const list = items
      .map(
        (item) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid #eaeef4">
             <div style="font-weight:650;color:#0a1f3c">${escapeHtml(item.title)}</div>
             <div style="font-size:14px;color:#5b6675;margin-top:2px">${escapeHtml(item.body)}</div>
           </td></tr>`,
      )
      .join('');

    try {
      await sendEmail(
        row.recipient_email,
        `AskCENLA: ${items.length} update${items.length === 1 ? '' : 's'}`,
        shell(
          `${items.length} update${items.length === 1 ? '' : 's'} today`,
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table>${button('/')}`,
        ),
      );
      await db.rpc('record_digest_delivery', { p_profile_id: row.profile_id, p_delivered: true });
      sent++;
    } catch (err) {
      await db.rpc('record_digest_delivery', {
        p_profile_id: row.profile_id,
        p_delivered: false,
        p_error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * The platform owner's daily summary: only the things a person has to decide.
 * Sent even when empty is pointless, so a quiet day sends nothing.
 */
async function sendOwnerDigest(): Promise<{ sent: number; failed: number }> {
  if (!OWNER_EMAIL) return { sent: 0, failed: 0 };

  const { data, error } = await db.rpc('owner_digest');
  if (error) throw new Error(`owner_digest failed: ${error.message}`);

  const digest = data as {
    unmatched: { code: string; trade: string; territory: string; address: string }[];
    pending_applications: { business_name: string; contact_name: string }[];
    past_due: { business_name: string }[];
    credentials_expiring: { business_name: string }[];
    offers_expiring_soon: number;
  };

  const sections: string[] = [];
  const section = (heading: string, lines: string[]) => {
    if (lines.length === 0) return;
    sections.push(
      `<h2 style="font-size:14px;color:#0a1f3c;margin:20px 0 8px">${escapeHtml(heading)}</h2>
       <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#38424f">
         ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}
       </ul>`,
    );
  };

  section(
    `Unmatched opportunities (${digest.unmatched.length})`,
    digest.unmatched.map((u) => `${u.code} · ${u.trade} in ${u.territory} — ${u.address}`),
  );
  section(
    `Applications awaiting review (${digest.pending_applications.length})`,
    digest.pending_applications.map((a) => `${a.business_name} (${a.contact_name})`),
  );
  section(
    `Memberships past due (${digest.past_due.length})`,
    digest.past_due.map((c) => c.business_name),
  );
  section(
    `Licence or insurance expiring within 30 days (${digest.credentials_expiring.length})`,
    digest.credentials_expiring.map((c) => c.business_name),
  );

  // Nothing needs a human today. Do not send an email saying so.
  if (sections.length === 0) return { sent: 0, failed: 0 };

  try {
    await sendEmail(
      OWNER_EMAIL,
      'AskCENLA — items needing your attention',
      shell('Items needing your attention', sections.join('') + button('/admin')),
    );
    return { sent: 1, failed: 0 };
  } catch {
    return { sent: 0, failed: 1 };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  // Called by the database scheduler, not by a signed-in user, so a shared
  // secret is the authentication.
  if (!CRON_SECRET || request.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  let mode: Mode = 'immediate';
  try {
    const payload = await request.json();
    if (payload?.mode) mode = payload.mode as Mode;
  } catch {
    // No body means the default mode.
  }

  try {
    const result =
      mode === 'digest' ? await sendDigests()
      : mode === 'owner' ? await sendOwnerDigest()
      : await sendImmediate();

    return new Response(JSON.stringify({ mode, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ mode, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
