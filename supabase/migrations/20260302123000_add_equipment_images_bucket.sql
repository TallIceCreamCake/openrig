insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types, owner)
values (
  'equipment-images',
  'equipment-images',
  true,
  5242880,
  '{"image/png","image/jpeg","image/webp","image/gif","image/bmp","image/svg+xml"}'::text[],
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
