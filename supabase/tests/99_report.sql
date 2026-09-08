-- ===========================================================================
-- Test report. Runs last; prints every assertion recorded by the suites above
-- and exits non-zero if any failed, so this is usable in CI.
-- ===========================================================================
\pset format aligned

select
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  case when passed then '' else 'expected ' || expected || ', got ' || actual end as detail
from tests.results
order by id;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from tests.results;

do $$
declare v_failed integer;
begin
  select count(*) into v_failed from tests.results where not passed;
  if v_failed > 0 then
    raise exception '% test(s) failed', v_failed;
  end if;
end $$;
