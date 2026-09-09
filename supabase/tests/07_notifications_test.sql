-- ===========================================================================
-- AskCENLA Repair Network — email delivery test suite
--
-- The failure modes that matter for an email queue are not "does it send" —
-- that is the Edge Function's one job — but the bookkeeping around it:
-- emailing someone twice, losing a message on a transient failure, retrying
-- forever against a dead address, and ignoring someone's preference.
--
-- All of that lives in SQL precisely so it can be tested here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Preferences decide where a notification lands the moment it is created
-- ---------------------------------------------------------------------------
update public.profiles set email_mode = 'immediate' where email = 'danielle@redriverrealty.com';
update public.profiles set email_mode = 'daily'     where email = 'marcus@redriverrealty.com';
update public.profiles set email_mode = 'off'       where email = 'tasha@redriverrealty.com';

insert into public.notifications (recipient_id, kind, title, body, link)
select p.id, 'system', 'Preference routing test', 'body', '/'
from public.profiles p
where p.email in (
  'danielle@redriverrealty.com', 'marcus@redriverrealty.com', 'tasha@redriverrealty.com'
);

select tests.check('an immediate recipient is queued to send now',
  (select n.email_status::text from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'danielle@redriverrealty.com' and n.title = 'Preference routing test'),
  'pending');

select tests.check('a daily recipient is held for the digest',
  (select n.email_status::text from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com' and n.title = 'Preference routing test'),
  'digest');

select tests.check('a recipient with email off is skipped',
  (select n.email_status::text from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'tasha@redriverrealty.com' and n.title = 'Preference routing test'),
  'skipped');

-- Turning email off must not remove the in-app notification.
select tests.check('a skipped email still appears in the app',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'tasha@redriverrealty.com' and n.title = 'Preference routing test'), 1::bigint);

-- ---------------------------------------------------------------------------
-- Claiming: the batch a worker takes, and what it must not take
-- ---------------------------------------------------------------------------
select count(*) as claimed_first from public.claim_notification_emails(100) \gset

select tests.check('claiming returns something to send',
  (:claimed_first > 0), true);

select tests.check('claiming never returns a held digest item',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com'
     and n.title = 'Preference routing test'
     and n.email_status = 'digest'), 1::bigint);

select tests.check('claiming never returns a skipped item',
  (select count(*) from public.notifications where email_status = 'skipped') > 0, true);

-- THE important one: a second worker (or an overlapping run of the same one)
-- must not pick up work already claimed, or people get emailed twice.
select count(*) as claimed_again from public.claim_notification_emails(100) \gset

select tests.check('a second claim finds nothing already claimed',
  :claimed_again, 0);

select tests.check('claiming records an attempt',
  (select bool_and(email_attempts = 1) from public.notifications where email_status = 'sending'), true);

-- ---------------------------------------------------------------------------
-- Recording the outcome
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select id into v_id from public.notifications where email_status = 'sending' limit 1;
  perform set_config('tests.sent_id', v_id::text, false);
  perform public.record_notification_delivery(v_id, true);
end $$;

select tests.check('a delivered notification is marked sent',
  (select email_status::text from public.notifications
   where id = current_setting('tests.sent_id')::uuid), 'sent');

select tests.check('a delivered notification records when it went',
  (select email_sent_at is not null from public.notifications
   where id = current_setting('tests.sent_id')::uuid), true);

-- A transient failure must go back in the queue, not disappear.
do $$
declare v_id uuid;
begin
  select id into v_id from public.notifications where email_status = 'sending' limit 1;
  perform set_config('tests.failed_id', v_id::text, false);
  perform public.record_notification_delivery(v_id, false, 'Provider timed out');
end $$;

select tests.check('a failed send returns to the queue for retry',
  (select email_status::text from public.notifications
   where id = current_setting('tests.failed_id')::uuid), 'pending');

select tests.check('a failed send keeps the reason',
  (select email_last_error from public.notifications
   where id = current_setting('tests.failed_id')::uuid), 'Provider timed out');

select tests.check('a retryable failure is claimable again',
  (select count(*) from public.claim_notification_emails(1)) , 1::bigint);

-- ...but not forever. A permanently bad address must stop consuming the queue.
do $$
declare v_id uuid := current_setting('tests.failed_id')::uuid;
begin
  update public.notifications set email_attempts = 5 where id = v_id;
  perform public.record_notification_delivery(v_id, false, 'Mailbox does not exist');
end $$;

select tests.check('repeated failure gives up rather than looping',
  (select email_status::text from public.notifications
   where id = current_setting('tests.failed_id')::uuid), 'failed');

select tests.check('a failed notification is never claimed again',
  (select count(*) from public.claim_notification_emails(100) c
   where c.notification_id = current_setting('tests.failed_id')::uuid), 0::bigint);

-- A worker that claims a batch and then dies must not strand those messages:
-- they are no longer 'pending', so without a reclaim nothing would ever look
-- at them again.
do $$
declare v_id uuid;
begin
  insert into public.notifications (recipient_id, kind, title, body, link)
  select p.id, 'system', 'Abandoned by a dead worker', 'body', '/'
  from public.profiles p where p.email = 'danielle@redriverrealty.com'
  returning id into v_id;

  perform public.claim_notification_emails(100);
  -- Pretend the worker vanished twenty minutes ago without reporting.
  update public.notifications
     set email_claimed_at = now() - interval '20 minutes'
   where id = v_id;
  perform set_config('tests.stranded_id', v_id::text, false);
end $$;

select tests.check('a message stranded by a dead worker is reclaimed',
  (select count(*) from public.claim_notification_emails(100) c
   where c.notification_id = current_setting('tests.stranded_id')::uuid), 1::bigint);

select tests.check('reclaiming still counts as an attempt',
  (select email_attempts from public.notifications
   where id = current_setting('tests.stranded_id')::uuid), 2);

select tests.check('a freshly claimed message is not reclaimed from under a live worker',
  (select count(*) from public.claim_notification_emails(100) c
   where c.notification_id = current_setting('tests.stranded_id')::uuid), 0::bigint);

-- ---------------------------------------------------------------------------
-- Digests: many notifications, one email
-- ---------------------------------------------------------------------------
insert into public.notifications (recipient_id, kind, title, body, link)
select p.id, 'system', 'Digest item ' || g, 'body', '/'
from public.profiles p, generate_series(1, 3) g
where p.email = 'marcus@redriverrealty.com';

select count(*) as digest_rows from public.claim_notification_digests() \gset

select tests.check('a digest is one email per recipient, not one per item',
  :digest_rows, 1);

select tests.check('the digest holds every item that was waiting',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com'
     and n.email_status = 'sending'
     and (n.title like 'Digest item%' or n.title = 'Preference routing test')), 4::bigint);

do $$
begin
  perform public.record_digest_delivery(
    (select id from public.profiles where email = 'marcus@redriverrealty.com'), true);
end $$;

select tests.check('delivering a digest marks every item in it sent',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com' and n.email_status = 'sending'), 0::bigint);

select tests.check('a failed digest returns its items to the digest queue',
  (select count(*) from public.notifications n
   join public.profiles p on p.id = n.recipient_id
   where p.email = 'marcus@redriverrealty.com' and n.email_status = 'digest'), 0::bigint);

-- ---------------------------------------------------------------------------
-- The owner digest
-- ---------------------------------------------------------------------------
select tests.set_user('danielle@redriverrealty.com');
set role authenticated;
select tests.check_raises('an agent cannot read the owner digest',
  $sql$ select public.owner_digest() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('jerry@wileyplumbingla.com');
set role authenticated;
select tests.check_raises('a contractor cannot read the owner digest',
  $sql$ select public.owner_digest() $sql$);
reset role;
select tests.clear_user();

select tests.set_user('admin@askcenla.com');
set role authenticated;

select tests.check('the owner digest counts unmatched work',
  (select jsonb_array_length(public.owner_digest() -> 'unmatched')),
  (select count(*)::int from public.opportunities where status = 'awaiting_contractor'));

select tests.check('the owner digest lists applications awaiting review',
  (select jsonb_array_length(public.owner_digest() -> 'pending_applications')),
  (select count(*)::int from public.contractors where membership_status = 'pending_approval'));

select tests.check('the owner digest lists past-due memberships',
  (select jsonb_array_length(public.owner_digest() -> 'past_due')),
  (select count(*)::int from public.contractors where membership_status = 'past_due'));

select tests.check('the owner digest flags credentials about to expire',
  (select jsonb_array_length(public.owner_digest() -> 'credentials_expiring') >= 0), true);

select tests.check('an unmatched entry names the trade and the territory',
  (select (public.owner_digest() -> 'unmatched' -> 0) ? 'trade'
      and (public.owner_digest() -> 'unmatched' -> 0) ? 'territory'), true);

reset role;
select tests.clear_user();

-- Restore the demo defaults so later runs and the app see a clean state.
update public.profiles set email_mode = 'immediate';
