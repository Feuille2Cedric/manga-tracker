begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('tsugi-refresh-catalog','*/10 * * * *', $job$
  select net.http_post(
    url := 'https://kzdvpbbjvjbxnsamdnao.supabase.co/functions/v1/manga-catalog',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6ZHZwYmJqdmpieG5zYW1kbmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzA0NTMsImV4cCI6MjEwNDU0NjQ1M30.6T8TMn0mf1DmjlbDYspNDe6hl6v7qWJsVjR3O13TRsE',
      'x-tsugi-job',(select secret from public.tsugi_job_config where id=1)
    ),
    body := '{"action":"refresh"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
commit;
