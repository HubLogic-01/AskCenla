-- ===========================================================================
-- AskCENLA Repair Network — 0003 private file storage
--
-- Inspection reports can contain private property and transaction detail, so
-- there is exactly ONE bucket and it is private. No object in it is ever
-- reachable by URL alone; the client asks for a signed URL that expires, and
-- Supabase only issues one if the policies below pass for that user.
--
-- Path convention (enforced by the policies):
--     requests/<repair_request_id>/<filename>
--     quotes/<quote_id>/<filename>
--
-- Because the policies delegate to the same app.can_view_* helpers used by the
-- table policies, file access and row access can never drift apart: a
-- contractor who cannot read the request row cannot read its inspection report
-- either, and both flip to allowed at the moment they accept.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,                       -- PRIVATE. Never flip this to true.
  26214400,                    -- 25 MB per file
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/heic', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Read. Delegates to the same visibility rules as the parent row.
-- ---------------------------------------------------------------------------
create policy attachments_object_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      app.is_admin()
      or (
        (storage.foldername(name))[1] = 'requests'
        and app.can_view_request(((storage.foldername(name))[2])::uuid)
      )
      or (
        (storage.foldername(name))[1] = 'quotes'
        and app.can_view_quote(((storage.foldername(name))[2])::uuid)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Write. An agent uploads only under their own request; a contractor only
-- under their own quote.
-- ---------------------------------------------------------------------------
create policy attachments_object_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (
      (
        (storage.foldername(name))[1] = 'requests'
        and exists (
          select 1 from public.repair_requests r
          where r.id = ((storage.foldername(name))[2])::uuid
            and r.created_by = auth.uid()
        )
      )
      or (
        (storage.foldername(name))[1] = 'quotes'
        and exists (
          select 1 from public.quotes q
          where q.id = ((storage.foldername(name))[2])::uuid
            and q.contractor_id = app.my_contractor_id()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Delete. Only the uploader (or an admin) can remove a file. There is
-- deliberately no UPDATE policy: replacing a file is a delete plus an insert,
-- so the audit trail in public.attachments stays truthful.
-- ---------------------------------------------------------------------------
create policy attachments_object_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (app.is_admin() or owner = auth.uid())
  );
