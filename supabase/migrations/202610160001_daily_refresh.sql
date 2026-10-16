begin;
select cron.alter_job(job_id:=jobid,schedule:='0 4 * * *') from cron.job where jobname='tsugi-refresh-catalog';
-- Existing good data is not checked again before a full day has elapsed.
update public.tsugi_catalog set next_refresh=greatest(next_refresh,(data->>'fetchedAt')::timestamptz+interval '24 hours') where data->>'fetchedAt' is not null;
commit;
