-- ===========================================================================
-- AskCENLA Repair Network — 0005 reference data
--
-- Trades and territories are not demo data: the application cannot function
-- without them, so they ship as a migration rather than as a seed. Values
-- match src/data/trades.ts and the territories in src/data/seed.ts.
--
-- The trade `code` is what builds an opportunity number (1042 + P = 1042-P),
-- so codes must never be reused or renamed.
-- ===========================================================================

insert into public.trades (key, label, code, description, sort_order) values
  ('plumbing',           'Plumbing',           'P', 'Leaks, water heaters, supply and drain lines', 10),
  ('electrical',         'Electrical',         'E', 'Panels, wiring, outlets, fixtures',            20),
  ('hvac',               'HVAC',               'H', 'Heating, cooling, ductwork, thermostats',      30),
  ('roofing',            'Roofing',            'R', 'Shingles, flashing, leaks, decking',           40),
  ('handyman',           'Handyman',           'M', 'Small mixed repairs and punch lists',          50),
  ('carpentry',          'Carpentry',          'C', 'Framing, trim, doors, decks, siding',          60),
  ('painting',           'Painting',           'N', 'Interior and exterior paint and prep',         70),
  ('foundation',         'Foundation',         'F', 'Piers, settling, slab and structural',         80),
  ('tree_landscaping',   'Tree / Landscaping', 'L', 'Tree removal, grading, drainage, yard',        90),
  ('pest_control',       'Pest Control',       'X', 'Termite letters, treatment, WDIR items',      100),
  ('septic',             'Septic',             'S', 'Tanks, field lines, inspections, pumping',    110),
  ('flooring',           'Flooring',           'O', 'Carpet, tile, vinyl, hardwood repair',        120),
  ('general_contractor', 'General Contractor', 'G', 'Multi-trade or larger scopes of work',        130),
  ('other',              'Other',              'Z', 'Anything that does not fit the list above',   140)
on conflict (key) do update
  set label = excluded.label,
      code  = excluded.code,
      description = excluded.description,
      sort_order  = excluded.sort_order;

-- Central Louisiana coverage areas.
insert into public.territories (id, name, parish, state) values
  ('7e000000-0000-4000-8000-000000000001', 'Alexandria',        'Rapides',   'LA'),
  ('7e000000-0000-4000-8000-000000000002', 'Pineville',         'Rapides',   'LA'),
  ('7e000000-0000-4000-8000-000000000003', 'Ball / Tioga',      'Rapides',   'LA'),
  ('7e000000-0000-4000-8000-000000000004', 'Boyce / Lecompte',  'Rapides',   'LA'),
  ('7e000000-0000-4000-8000-000000000005', 'Marksville',        'Avoyelles', 'LA'),
  ('7e000000-0000-4000-8000-000000000006', 'Leesville',         'Vernon',    'LA')
on conflict (id) do nothing;

insert into public.territory_zips (zip, territory_id) values
  ('71301', '7e000000-0000-4000-8000-000000000001'),
  ('71302', '7e000000-0000-4000-8000-000000000001'),
  ('71303', '7e000000-0000-4000-8000-000000000001'),
  ('71360', '7e000000-0000-4000-8000-000000000002'),
  ('71405', '7e000000-0000-4000-8000-000000000003'),
  ('71477', '7e000000-0000-4000-8000-000000000003'),
  ('71409', '7e000000-0000-4000-8000-000000000004'),
  ('71346', '7e000000-0000-4000-8000-000000000004'),
  ('71351', '7e000000-0000-4000-8000-000000000005'),
  ('71446', '7e000000-0000-4000-8000-000000000006')
on conflict (zip) do nothing;
