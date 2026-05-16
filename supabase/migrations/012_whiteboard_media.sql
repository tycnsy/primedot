-- prime. — Whiteboard media bucket for image/gif imports

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whiteboard-media',
  'whiteboard-media',
  true,
  26214400,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "whiteboard_media_read_public" on storage.objects;
create policy "whiteboard_media_read_public"
  on storage.objects for select
  using (bucket_id = 'whiteboard-media');

drop policy if exists "whiteboard_media_insert_own" on storage.objects;
create policy "whiteboard_media_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'whiteboard-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "whiteboard_media_delete_own" on storage.objects;
create policy "whiteboard_media_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'whiteboard-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
