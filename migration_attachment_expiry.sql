-- Enable these extensions from the Supabase SQL Editor if they are not enabled yet.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- First store these three values in Supabase Vault using vault.create_secret(...):
--   fastcord_project_url                 e.g. https://<project-ref>.supabase.co
--   fastcord_attachment_cleanup_secret   a long random secret also configured on the Edge Function
-- Never commit those values or put them directly into this SQL file.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'fastcord-expire-attachments-daily';

SELECT cron.schedule(
  'fastcord-expire-attachments-daily',
  '17 3 * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'fastcord_project_url')
        || '/functions/v1/cleanup-expired-attachments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'fastcord_attachment_cleanup_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);
