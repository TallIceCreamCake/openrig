-- Grant missing permissions on tables created after the full schema snapshot
-- rental_document_requests and rental_activity_logs were created without GRANT statements

grant all on table public.rental_document_requests to anon;
grant all on table public.rental_document_requests to authenticated;
grant all on table public.rental_document_requests to service_role;

grant all on table public.rental_activity_logs to anon;
grant all on table public.rental_activity_logs to authenticated;
grant all on table public.rental_activity_logs to service_role;
