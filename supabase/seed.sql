-- ===========================================================================
-- AskCENLA Repair Network — demo seed data
--
-- DEVELOPMENT AND DEMO ONLY. Do not run this against a production project.
--
-- Everything here is fictional. It exists so a fresh database looks like a
-- working marketplace: four sign-in accounts, a vetted contractor network, six
-- properties, and opportunities in every interesting state (accepted, quoted,
-- declined-and-rerouted, and one genuine coverage gap).
--
-- Safe to run more than once: every statement is idempotent.
--
-- Demo password for all four accounts: askcenla-demo
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Brokerages
-- ---------------------------------------------------------------------------
insert into public.brokerages (id, name, city, state, phone) values
  ('b0000000-0000-4000-8000-000000000001', 'Red River Realty Group',   'Alexandria', 'LA', '3184450100'),
  ('b0000000-0000-4000-8000-000000000002', 'Cenla Premier Properties', 'Pineville',  'LA', '3184870190')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Contractor network
-- ---------------------------------------------------------------------------
insert into public.contractors (
  id, business_name, contact_name, email, phone, address_line1, city, state, zip,
  license_number, license_expires_on, insurance_carrier, insurance_expires_on,
  availability, membership_status, is_active, accepting_opportunities, rotation_priority,
  offers_received, offers_accepted, avg_response_hours, jobs_won
) values
  ('c0000000-0000-4000-8000-000000000001', 'Wiley Plumbing', 'Jerry Wiley', 'jerry@wileyplumbingla.com', '3184420088',
   '2210 Lee Street', 'Alexandria', 'LA', '71301',
   'LA-MP-40218', current_date + 240, 'Gulf States Mutual', current_date + 140,
   'available', 'active', true, true, 1, 34, 27, 3.4, 19),

  ('c0000000-0000-4000-8000-000000000002', 'Red River Plumbing Co.', 'Alicia Fontenot', 'office@redriverplumbing.com', '3184870044',
   '805 Main Street', 'Pineville', 'LA', '71360',
   'LA-MP-38801', current_date + 310, 'Pelican Insurance', current_date + 200,
   'available', 'active', true, true, 2, 28, 18, 8.1, 11),

  ('c0000000-0000-4000-8000-000000000003', 'Bayou Pipe & Drain', 'Cole Rachal', 'cole@bayoupipe.com', '3184440077',
   '119 Bolton Avenue', 'Alexandria', 'LA', '71301',
   'LA-MP-41902', current_date + 90, 'Gulf States Mutual', current_date + 45,
   'limited', 'active', true, true, 3, 12, 6, 19.6, 4),

  ('c0000000-0000-4000-8000-000000000004', 'Smith Electric', 'Darrell Smith', 'darrell@smithelectricla.com', '3184431290',
   '3400 Jackson Street', 'Alexandria', 'LA', '71303',
   'LA-EC-22194', current_date + 400, 'Cajun Casualty', current_date + 220,
   'available', 'active', true, true, 1, 41, 33, 2.2, 24),

  ('c0000000-0000-4000-8000-000000000005', 'Cenla Power Solutions', 'Brian Nash', 'brian@cenlapower.com', '3187150066',
   '77 Highway 165', 'Ball', 'LA', '71405',
   'LA-EC-25510', current_date + 150, 'Pelican Insurance', current_date + 15,
   'available', 'active', true, true, 2, 17, 12, 6.8, 7),

  ('c0000000-0000-4000-8000-000000000006', 'Cypress Heating & Cooling', 'Monica Deville', 'monica@cypresshvac.com', '3184482255',
   '1220 MacArthur Drive', 'Alexandria', 'LA', '71301',
   'LA-HVAC-13345', current_date + 280, 'Gulf States Mutual', current_date + 180,
   'available', 'active', true, true, 1, 30, 25, 4.1, 18),

  ('c0000000-0000-4000-8000-000000000007', 'Delta Air Systems', 'Wes Toussaint', 'wes@deltaairsystems.com', '3184862121',
   '410 Shirley Street', 'Pineville', 'LA', '71360',
   'LA-HVAC-15002', current_date + 330, 'Cajun Casualty', current_date + 260,
   'limited', 'active', true, true, 2, 21, 14, 11.2, 9),

  ('c0000000-0000-4000-8000-000000000008', 'Kisatchie Roofing', 'Paul Doucet', 'paul@kisatchieroofing.com', '3184417788',
   '910 Rapides Avenue', 'Alexandria', 'LA', '71301',
   'LA-RC-77410', current_date + 210, 'Pelican Insurance', current_date + 120,
   'limited', 'active', true, true, 1, 26, 15, 14.5, 10),

  -- Payment failed. The matching engine skips this contractor with no admin action.
  ('c0000000-0000-4000-8000-000000000009', 'Ironwood Roofing', 'Sam Ardoin', 'sam@ironwoodroof.com', '3187740099',
   '55 Twin Bridges Road', 'Alexandria', 'LA', '71302',
   'LA-RC-79115', current_date + 60, null, null,
   'available', 'past_due', true, true, 2, 9, 4, 22.9, 2),

  ('c0000000-0000-4000-8000-00000000000a', 'Bayou Built Construction', 'Trey Lemoine', 'trey@bayoubuilt.com', '3184559911',
   '2600 Horseshoe Drive', 'Alexandria', 'LA', '71301',
   'LA-GC-58820', current_date + 500, 'Gulf States Mutual', current_date + 300,
   'available', 'active', true, true, 1, 38, 29, 5.5, 21),

  ('c0000000-0000-4000-8000-00000000000b', 'Cenla Pest & Termite', 'Gina Marcotte', 'gina@cenlapest.com', '3184433322',
   '1401 Texas Avenue', 'Alexandria', 'LA', '71301',
   'LA-PC-30021', current_date + 190, 'Cajun Casualty', current_date + 160,
   'available', 'active', true, true, 1, 15, 13, 2.9, 11),

  ('c0000000-0000-4000-8000-00000000000c', 'Riverbend Tree Service', 'Luke Hebert', 'luke@riverbendtree.com', '3187019090',
   '88 Beaver Creek Road', 'Pineville', 'LA', '71360',
   null, null, 'Pelican Insurance', current_date + 75,
   'available', 'trial', true, true, 1, 6, 5, 4.8, 3),

  -- Applied but not yet reviewed. Invisible to matching until an admin approves,
  -- which is what makes the flooring coverage gap below a real gap.
  ('c0000000-0000-4000-8000-00000000000d', 'Heritage Flooring of Cenla', 'Nikki Landry', 'nikki@heritageflooringla.com', '3184447766',
   '3115 Monroe Street', 'Alexandria', 'LA', '71301',
   null, null, null, null,
   'available', 'pending_approval', false, true, 5, 0, 0, 0, 0)
on conflict (id) do nothing;

insert into public.contractor_trades (contractor_id, trade_key) values
  ('c0000000-0000-4000-8000-000000000001', 'plumbing'),
  ('c0000000-0000-4000-8000-000000000002', 'plumbing'),
  ('c0000000-0000-4000-8000-000000000002', 'septic'),
  ('c0000000-0000-4000-8000-000000000003', 'plumbing'),
  ('c0000000-0000-4000-8000-000000000004', 'electrical'),
  ('c0000000-0000-4000-8000-000000000005', 'electrical'),
  ('c0000000-0000-4000-8000-000000000005', 'handyman'),
  ('c0000000-0000-4000-8000-000000000006', 'hvac'),
  ('c0000000-0000-4000-8000-000000000007', 'hvac'),
  ('c0000000-0000-4000-8000-000000000008', 'roofing'),
  ('c0000000-0000-4000-8000-000000000008', 'carpentry'),
  ('c0000000-0000-4000-8000-000000000009', 'roofing'),
  ('c0000000-0000-4000-8000-00000000000a', 'general_contractor'),
  ('c0000000-0000-4000-8000-00000000000a', 'carpentry'),
  ('c0000000-0000-4000-8000-00000000000a', 'handyman'),
  ('c0000000-0000-4000-8000-00000000000a', 'painting'),
  ('c0000000-0000-4000-8000-00000000000a', 'foundation'),
  ('c0000000-0000-4000-8000-00000000000b', 'pest_control'),
  ('c0000000-0000-4000-8000-00000000000c', 'tree_landscaping'),
  ('c0000000-0000-4000-8000-00000000000d', 'flooring')
on conflict do nothing;

insert into public.contractor_territories (contractor_id, territory_id)
select c.id::uuid, t.id
from (values
  ('c0000000-0000-4000-8000-000000000001', array['Alexandria','Pineville','Ball / Tioga']),
  ('c0000000-0000-4000-8000-000000000002', array['Pineville','Alexandria']),
  ('c0000000-0000-4000-8000-000000000003', array['Alexandria']),
  ('c0000000-0000-4000-8000-000000000004', array['Alexandria','Pineville','Ball / Tioga','Boyce / Lecompte']),
  ('c0000000-0000-4000-8000-000000000005', array['Ball / Tioga','Pineville']),
  ('c0000000-0000-4000-8000-000000000006', array['Alexandria','Pineville','Ball / Tioga']),
  ('c0000000-0000-4000-8000-000000000007', array['Pineville','Alexandria']),
  ('c0000000-0000-4000-8000-000000000008', array['Alexandria','Ball / Tioga','Boyce / Lecompte']),
  ('c0000000-0000-4000-8000-000000000009', array['Alexandria']),
  ('c0000000-0000-4000-8000-00000000000a', array['Alexandria','Pineville','Ball / Tioga','Boyce / Lecompte']),
  ('c0000000-0000-4000-8000-00000000000b', array['Alexandria','Pineville','Ball / Tioga','Marksville']),
  ('c0000000-0000-4000-8000-00000000000c', array['Pineville','Alexandria','Ball / Tioga']),
  ('c0000000-0000-4000-8000-00000000000d', array['Alexandria'])
) as c(id, names)
cross join lateral unnest(c.names) as n(name)
join public.territories t on t.name = n.name
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Demo sign-in accounts
--
-- If you already created these users in the Supabase Dashboard, this block
-- leaves them alone and the rest of the seed links to them by email.
-- The on_auth_user_created trigger creates the matching public.profiles row.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id::uuid,
  'authenticated', 'authenticated',
  u.email,
  crypt('askcenla-demo', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  u.meta::jsonb,
  now(), now()
from (values
  ('a0000000-0000-4000-8000-000000000001', 'danielle@redriverrealty.com',
   '{"role":"agent","full_name":"Danielle Ortiz","phone":"3184450112"}'),
  ('a0000000-0000-4000-8000-000000000002', 'marcus@redriverrealty.com',
   '{"role":"agent","full_name":"Marcus Webb","phone":"3184450145"}'),
  ('a0000000-0000-4000-8000-000000000003', 'tasha@redriverrealty.com',
   '{"role":"agent","full_name":"Tasha Bordelon","phone":"3184450178"}'),
  ('a0000000-0000-4000-8000-000000000004', 'renee@redriverrealty.com',
   '{"role":"broker","full_name":"Renee Guillory","phone":"3184450101"}'),
  ('a0000000-0000-4000-8000-000000000005', 'jerry@wileyplumbingla.com',
   '{"role":"contractor","full_name":"Jerry Wiley","phone":"3184420088","business_name":"Wiley Plumbing"}'),
  ('a0000000-0000-4000-8000-000000000006', 'admin@askcenla.com',
   '{"role":"agent","full_name":"AskCENLA Admin","phone":"3185550000"}')
) as u(id, email, meta)
where not exists (select 1 from auth.users e where e.email = u.email);

-- Email/password identity records, required for password sign-in.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u
where u.email in (
  'danielle@redriverrealty.com', 'marcus@redriverrealty.com', 'tasha@redriverrealty.com',
  'renee@redriverrealty.com', 'jerry@wileyplumbingla.com', 'admin@askcenla.com'
)
and not exists (
  select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
);

-- The admin account is created as an agent above, because the sign-up trigger
-- deliberately refuses to grant 'admin' from user-supplied metadata. Promote it
-- here, which is the same thing you would do in the SQL editor for a real
-- administrator.
update public.profiles set role = 'admin' where email = 'admin@askcenla.com';

-- Link agents and the broker to their brokerage.
update public.profiles set brokerage_id = 'b0000000-0000-4000-8000-000000000001'
where email in (
  'danielle@redriverrealty.com', 'marcus@redriverrealty.com',
  'tasha@redriverrealty.com', 'renee@redriverrealty.com'
);

insert into public.brokerage_members (brokerage_id, profile_id, role_in_brokerage)
select 'b0000000-0000-4000-8000-000000000001', p.id,
       case when p.role = 'broker' then 'broker' else 'agent' end
from public.profiles p
where p.brokerage_id = 'b0000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- Point the contractor account at the seeded Wiley Plumbing record and remove
-- the placeholder contractor the sign-up trigger created for it.
do $$
declare
  v_auto uuid;
begin
  select contractor_id into v_auto
  from public.profiles where email = 'jerry@wileyplumbingla.com';

  if v_auto is not null and v_auto <> 'c0000000-0000-4000-8000-000000000001' then
    update public.profiles
       set contractor_id = 'c0000000-0000-4000-8000-000000000001'
     where email = 'jerry@wileyplumbingla.com';
    delete from public.contractors where id = v_auto;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Repair requests
-- ---------------------------------------------------------------------------
insert into public.repair_requests (
  id, reference, created_by, brokerage_id, address_line1, city, state, zip,
  territory_id, mls_number, transaction_type, status,
  contact_name, contact_brokerage, contact_phone, contact_email,
  submitted_at, created_at
)
select
  v.id::uuid, v.reference, p.id, 'b0000000-0000-4000-8000-000000000001',
  v.address, v.city, 'LA', v.zip,
  (select territory_id from public.territory_zips z where z.zip = v.zip),
  v.mls, v.ttype::public.transaction_type, v.status::public.request_status,
  p.full_name, 'Red River Realty Group', p.phone, p.email,
  now() - (v.days_ago || ' days')::interval,
  now() - (v.days_ago || ' days')::interval
from (values
  ('10420000-0000-4000-8000-000000000000', 1042, 'danielle@redriverrealty.com', '123 Main Street',              'Alexandria', '71301', 'CEN-184402', 'buyer_side',     'in_progress', 6),
  ('10430000-0000-4000-8000-000000000000', 1043, 'danielle@redriverrealty.com', '4417 Jackson Street Extension','Alexandria', '71303', 'CEN-184519', 'listing_prep',   'in_progress', 3),
  ('10440000-0000-4000-8000-000000000000', 1044, 'marcus@redriverrealty.com',   '219 Bayou Road',               'Pineville',  '71360', null,         'seller_side',    'in_progress', 2),
  ('10450000-0000-4000-8000-000000000000', 1045, 'tasha@redriverrealty.com',    '88 Cypress Bend Drive',        'Ball',       '71405', 'CEN-184630', 'buyer_side',     'submitted',   1),
  ('10460000-0000-4000-8000-000000000000', 1046, 'danielle@redriverrealty.com', '1502 Texas Avenue',            'Alexandria', '71301', 'CEN-183990', 'property_owner', 'completed',  28),
  ('10470000-0000-4000-8000-000000000000', 1047, 'marcus@redriverrealty.com',   '7 Windemere Court',            'Alexandria', '71303', 'CEN-184701', 'buyer_side',     'in_progress', 1)
) as v(id, reference, agent_email, address, city, zip, mls, ttype, status, days_ago)
join public.profiles p on p.email = v.agent_email
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Repair items — the multi-trade content of each request
-- ---------------------------------------------------------------------------
insert into public.repair_items (request_id, trade_key, description, urgency, estimate_deadline, notes)
select r.id, v.trade, v.description, v.urgency::public.urgency_level,
       current_date + v.deadline_days, v.notes
from (values
  (1042, 'plumbing',         'Inspection noted an active leak under the kitchen sink and corroded shutoff valves at both bathroom vanities. Water heater TPR discharge line terminates improperly.', 'urgent',   4,  'Buyer requesting licensed plumber receipt at closing.'),
  (1042, 'electrical',       'Double-tapped breakers in main panel, two ungrounded receptacles in the den, and missing GFCI protection in the hall bathroom.',                                      'urgent',   4,  null),
  (1042, 'roofing',          'Damaged and missing shingles on the rear slope; flashing separation at the chimney with evidence of prior moisture in the attic.',                                   'standard', 6,  'Roof is approximately 17 years old per seller disclosure.'),
  (1042, 'hvac',             'Condenser fan motor noisy under load, return duct disconnected in the crawlspace, and system has not been serviced in 3+ years.',                                    'standard', 5,  null),
  (1043, 'foundation',       'Noticeable slope in the rear bedroom floor and stair-step cracking in the exterior brick near the northeast corner.',                                                'standard', 8,  'Seller wants an evaluation letter before listing.'),
  (1043, 'tree_landscaping', 'Large water oak overhanging the roofline needs trimming or removal; two dead limbs over the driveway.',                                                              'standard', 10, null),
  (1044, 'hvac',             'Upstairs unit not cooling below 78 degrees. Suspected low refrigerant charge or failing compressor.',                                                                'urgent',   3,  null),
  (1044, 'plumbing',         'Slow drain in the hall bath tub and a running toilet in the primary suite.',                                                                                        'standard', 5,  null),
  (1044, 'flooring',         'Water-damaged vinyl in the laundry room needs replacement, roughly 90 square feet.',                                                                                'flexible', 12, null),
  (1045, 'roofing',          'Inspector flagged granule loss across the front slope and two soft spots in the decking above the garage.',                                                         'urgent',   3,  'Closing scheduled in 21 days.'),
  (1046, 'plumbing',         'Replace failed water heater and bring the discharge piping up to code.',                                                                                            'urgent',  -24, null),
  (1046, 'painting',         'Repaint the exterior soffit and fascia after carpentry repairs.',                                                                                                   'flexible',-18, null),
  (1047, 'electrical',       'Federal Pacific panel flagged by the inspector; buyer is requesting a full panel replacement quote.',                                                               'urgent',   3,  null),
  (1047, 'plumbing',         'Cast iron drain line under the house shows scaling; inspector recommends a camera scope of the main line.',                                                         'standard', 6,  'Buyer will pay for the scope if the seller declines.'),
  (1047, 'handyman',         'Punch list: three interior doors will not latch, loose stair handrail, and a missing dryer vent cover.',                                                            'flexible', 9,  null)
) as v(reference, trade, description, urgency, deadline_days, notes)
join public.repair_requests r on r.reference = v.reference
on conflict (request_id, trade_key) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Opportunities — exactly one per repair item.
-- The opportunities_set_code trigger derives "1042-P" and friends.
--
-- Inserted as 'new', NOT 'matching'. Since 0007 an opportunity created as
-- 'matching' routes itself immediately, which is right for a real submission
-- and wrong here: this demo data has a hand-authored routing ladder below
-- (including a decline and an expiry) that live routing would overwrite.
-- ---------------------------------------------------------------------------
insert into public.opportunities (request_id, repair_item_id, trade_key, territory_id, status, created_at)
select i.request_id, i.id, i.trade_key, r.territory_id, 'new', i.created_at
from public.repair_items i
join public.repair_requests r on r.id = i.request_id
where not exists (select 1 from public.opportunities o where o.repair_item_id = i.id);

-- Move each one to its demo state.
update public.opportunities o
set status           = v.status::public.opportunity_status,
    contractor_id    = v.contractor::uuid,
    routing_position = v.position,
    offered_at       = case when v.offered_hours_ago is null then null
                            else now() - (v.offered_hours_ago || ' hours')::interval end,
    offer_expires_at = case when v.expires_hours is null then null
                            else now() + (v.expires_hours || ' hours')::interval end,
    accepted_at      = case when v.accepted_hours_ago is null then null
                            else now() - (v.accepted_hours_ago || ' hours')::interval end
from (values
  (1042, 'plumbing',         'quote_submitted',      'c0000000-0000-4000-8000-000000000001', 0, 144, null, 141),
  (1042, 'electrical',       'accepted',             'c0000000-0000-4000-8000-000000000004', 0, 144, null, 142),
  (1042, 'roofing',          'awaiting_contractor',  null,                                   1, 120, null, null),
  (1042, 'hvac',             'inspection_scheduled', 'c0000000-0000-4000-8000-000000000006', 0, 144, null, 116),
  (1043, 'foundation',       'accepted',             'c0000000-0000-4000-8000-00000000000a', 0,  72, null,  67),
  (1043, 'tree_landscaping', 'offered',              null,                                   0,   5,   19, null),
  (1044, 'hvac',             'quote_in_progress',    'c0000000-0000-4000-8000-000000000007', 1,  24, null,  18),
  (1044, 'plumbing',         'offered',              null,                                   0,  51,  -27, null),
  (1044, 'flooring',         'awaiting_contractor',  null,                                   0, null, null, null),
  (1045, 'roofing',          'offered',              null,                                   0,  24,    4, null),
  (1046, 'plumbing',         'completed',            'c0000000-0000-4000-8000-000000000001', 0, 672, null, 670),
  (1046, 'painting',         'completed',            'c0000000-0000-4000-8000-00000000000a', 0, 648, null, 644),
  (1047, 'electrical',       'accepted',             'c0000000-0000-4000-8000-000000000004', 0,  30, null,  26),
  (1047, 'plumbing',         'offered',              null,                                   0,   3,   21, null),
  (1047, 'handyman',         'accepted',             'c0000000-0000-4000-8000-00000000000a', 0,  30, null,  28)
) as v(reference, trade, status, contractor, position, offered_hours_ago, expires_hours, accepted_hours_ago)
where o.trade_key = v.trade
  and o.request_id = (select id from public.repair_requests where reference = v.reference);

-- ---------------------------------------------------------------------------
-- 7. The routing ladder — every offer that was ever made
--
-- 1044-P is deliberately an offer that lapsed without a response, so a fresh
-- database demonstrates the scheduled sweep advancing it to the next
-- contractor rather than needing you to wait 24 hours for one to appear.
-- ---------------------------------------------------------------------------
insert into public.opportunity_assignments (
  opportunity_id, contractor_id, position, outcome, offered_at, responded_at, expires_at
)
select
  o.id, v.contractor::uuid, v.position, v.outcome::public.assignment_outcome,
  now() - (v.offered_hours_ago || ' hours')::interval,
  case when v.responded_hours_ago is null then null
       else now() - (v.responded_hours_ago || ' hours')::interval end,
  now() - (v.offered_hours_ago || ' hours')::interval + interval '24 hours'
from (values
  (1042, 'plumbing',         'c0000000-0000-4000-8000-000000000001', 0, 'accepted', 144, 141),
  (1042, 'electrical',       'c0000000-0000-4000-8000-000000000004', 0, 'accepted', 144, 142),
  (1042, 'roofing',          'c0000000-0000-4000-8000-000000000008', 0, 'declined', 144, 122),
  (1042, 'roofing',          'c0000000-0000-4000-8000-000000000009', 1, 'expired',  120, null),
  (1042, 'hvac',             'c0000000-0000-4000-8000-000000000006', 0, 'accepted', 144, 116),
  (1043, 'foundation',       'c0000000-0000-4000-8000-00000000000a', 0, 'accepted',  72,  67),
  (1043, 'tree_landscaping', 'c0000000-0000-4000-8000-00000000000c', 0, 'pending',    5, null),
  (1044, 'hvac',             'c0000000-0000-4000-8000-000000000006', 0, 'declined',  48,  30),
  (1044, 'hvac',             'c0000000-0000-4000-8000-000000000007', 1, 'accepted',  24,  18),
  (1044, 'plumbing',         'c0000000-0000-4000-8000-000000000001', 0, 'pending',   51, null),
  (1045, 'roofing',          'c0000000-0000-4000-8000-000000000008', 0, 'pending',   24, null),
  (1046, 'plumbing',         'c0000000-0000-4000-8000-000000000001', 0, 'accepted', 672, 670),
  (1046, 'painting',         'c0000000-0000-4000-8000-00000000000a', 0, 'accepted', 648, 644),
  (1047, 'electrical',       'c0000000-0000-4000-8000-000000000004', 0, 'accepted',  30,  26),
  (1047, 'plumbing',         'c0000000-0000-4000-8000-000000000001', 0, 'pending',    3, null),
  (1047, 'handyman',         'c0000000-0000-4000-8000-00000000000a', 0, 'accepted',  30,  28)
) as v(reference, trade, contractor, position, outcome, offered_hours_ago, responded_hours_ago)
join public.repair_requests r on r.reference = v.reference
join public.opportunities   o on o.request_id = r.id and o.trade_key = v.trade
on conflict (opportunity_id, contractor_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Quotes
-- ---------------------------------------------------------------------------
insert into public.quotes (
  id, quote_number, opportunity_id, contractor_id, status, notes, exclusions,
  tax_rate, expires_on, submitted_at, created_at
)
select
  v.id::uuid, v.number, o.id, v.contractor::uuid, v.status::public.quote_status,
  v.notes, v.exclusions, 0,
  case when v.expires_days is null then null else current_date + v.expires_days end,
  case when v.submitted_hours_ago is null then null
       else now() - (v.submitted_hours_ago || ' hours')::interval end,
  now() - (v.created_hours_ago || ' hours')::interval
from (values
  ('90000000-0000-4000-8000-000000000001', 'Q-1042P-01', 1042, 'plumbing', 'c0000000-0000-4000-8000-000000000001', 'submitted',
   'Price includes all parts and labor. Work can be scheduled within 3 business days of approval.',
   'Excludes drywall repair, painting, and any cast iron drain line replacement not visible at time of estimate.',
   24, 96, 120),
  ('90000000-0000-4000-8000-000000000002', 'Q-1044H-01', 1044, 'hvac', 'c0000000-0000-4000-8000-000000000007', 'draft',
   null, null, null, null, 4),
  ('90000000-0000-4000-8000-000000000003', 'Q-1046P-01', 1046, 'plumbing', 'c0000000-0000-4000-8000-000000000001', 'accepted',
   'Includes haul-away of the old unit and a 6-year tank warranty.',
   'Excludes permit fees if required by the parish.',
   -14, 624, 648)
) as v(id, number, reference, trade, contractor, status, notes, exclusions,
       expires_days, submitted_hours_ago, created_hours_ago)
join public.repair_requests r on r.reference = v.reference
join public.opportunities   o on o.request_id = r.id and o.trade_key = v.trade
on conflict (id) do nothing;

insert into public.quote_items (quote_id, position, description, quantity, unit_price) values
  ('90000000-0000-4000-8000-000000000001', 0, 'Repair active leak at kitchen sink drain assembly',      1,  185.00),
  ('90000000-0000-4000-8000-000000000001', 1, 'Replace corroded angle stops (bathroom vanities)',       4,   55.00),
  ('90000000-0000-4000-8000-000000000001', 2, 'Re-pipe water heater TPR discharge to code',             1,  145.00),
  ('90000000-0000-4000-8000-000000000002', 0, 'Diagnostic and refrigerant leak search (upstairs system)',1,  165.00),
  ('90000000-0000-4000-8000-000000000003', 0, '50-gallon gas water heater, supplied and installed',     1, 1480.00),
  ('90000000-0000-4000-8000-000000000003', 1, 'Code-compliant discharge piping and expansion tank',     1,  240.00)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. Attachments. storage_path always points inside the PRIVATE bucket.
-- ---------------------------------------------------------------------------
insert into public.attachments (request_id, kind, file_name, storage_path, mime_type, size_bytes, uploaded_by)
select r.id, v.kind::public.attachment_kind, v.file_name,
       'requests/' || r.id || '/' || v.file_name,
       v.mime, v.size, r.created_by
from (values
  (1042, 'inspection_report',   '123-Main-St-Inspection.pdf',          'application/pdf', 4812004),
  (1042, 'photo',               'kitchen-sink-leak.jpg',               'image/jpeg',      1204882),
  (1042, 'photo',               'panel-double-tap.jpg',                'image/jpeg',       988231),
  (1043, 'inspection_report',   'Jackson-Ext-Structural-Notes.pdf',    'application/pdf', 2338110),
  (1044, 'inspection_report',   '219-Bayou-Rd-Inspection.pdf',         'application/pdf', 5120440),
  (1045, 'inspection_report',   'Cypress-Bend-Roof-Report.pdf',        'application/pdf', 3004918),
  (1047, 'inspection_report',   'Windemere-Ct-Full-Inspection.pdf',    'application/pdf', 6442000),
  (1047, 'supporting_document', 'Buyer-Repair-Addendum.pdf',           'application/pdf',  412800)
) as v(reference, kind, file_name, mime, size)
join public.repair_requests r on r.reference = v.reference
on conflict (storage_path) do nothing;

-- ---------------------------------------------------------------------------
-- 10. Notifications
-- ---------------------------------------------------------------------------
insert into public.notifications (recipient_id, kind, title, body, link, read_at, created_at)
select p.id, v.kind::public.notification_kind, v.title, v.body, v.link,
       case when v.read then now() - interval '5 days' else null end,
       now() - (v.hours_ago || ' hours')::interval
from (values
  ('danielle@redriverrealty.com', 'quote_submitted',      'Quote received — 1042-P Plumbing',            'Wiley Plumbing submitted a $550.00 quote for 123 Main Street.',                 '/agent/properties', false,  96),
  ('danielle@redriverrealty.com', 'reminder',             'Roofing still needs a contractor',            '1042-R has been through 2 contractors. AskCENLA is expanding the search.',      '/agent/properties', false,  94),
  ('danielle@redriverrealty.com', 'opportunity_accepted', 'Cypress Heating & Cooling accepted 1042-H',   'An inspection has been scheduled for the HVAC scope.',                          '/agent/properties', true,  116),
  ('jerry@wileyplumbingla.com',   'opportunity_offered',  'New opportunity — 1047-P Plumbing',           'Alexandria, LA 71303 · respond within 24 hours',                               '/contractor/opportunities', false, 3),
  ('jerry@wileyplumbingla.com',   'opportunity_offered',  'New opportunity — 1044-P Plumbing',           'Pineville, LA 71360 · respond within 24 hours',                                '/contractor/opportunities', false, 8),
  ('renee@redriverrealty.com',    'reminder',             '2 opportunities need attention',              'Red River Realty Group has 2 opportunities without an assigned contractor.',    '/broker', false, 2),
  ('admin@askcenla.com',          'system',               'Contractor application pending review',       'Heritage Flooring of Cenla applied 4 days ago and is awaiting approval.',       '/admin/contractors', false, 96)
) as v(email, kind, title, body, link, read, hours_ago)
join public.profiles p on p.email = v.email
on conflict do nothing;
