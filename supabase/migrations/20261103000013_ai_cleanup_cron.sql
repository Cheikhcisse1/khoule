-- Purge nocturne de l'assistant IA (03:00 UTC) : historique > 90 jours, compteurs > 30 jours.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('ai-cleanup-nightly', '0 3 * * *', $$select public.ai_cleanup()$$);
