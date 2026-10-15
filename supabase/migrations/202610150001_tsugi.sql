begin;
-- Extend the existing app namespace without touching existing documents or policies.
alter table public.personal_app_state drop constraint personal_app_state_app_check;
alter table public.personal_app_state add constraint personal_app_state_app_check check (app in ('curio','mes-apps','tsugi'));
do $$
declare definition text;
begin
  select pg_get_functiondef('public.personal_app_save(text,bigint,jsonb)'::regprocedure) into definition;
  if position('''curio'',''mes-apps''' in definition)=0 then
    raise exception 'Unexpected personal_app_save definition; review before migration';
  end if;
  execute replace(definition,'''curio'',''mes-apps''','''curio'',''mes-apps'',''tsugi''');
end $$;

create table public.tsugi_catalog (
  id text primary key check (id ~ '^(manga|anime|mu):[1-9][0-9]{0,15}$'),
  data jsonb not null,
  next_refresh timestamptz not null default now(),
  last_error text
);
alter table public.tsugi_catalog enable row level security;
revoke all on public.tsugi_catalog from anon,authenticated;
grant select on public.tsugi_catalog to anon,authenticated;
grant all on public.tsugi_catalog to service_role;
create policy tsugi_public_catalog on public.tsugi_catalog for select to anon,authenticated using (true);
create index tsugi_catalog_refresh on public.tsugi_catalog(next_refresh);
create function public.tsugi_claim_refresh() returns setof public.tsugi_catalog
language sql security definer set search_path='' as $$
  update public.tsugi_catalog set next_refresh=now()+interval '10 minutes'
  where id in (select id from public.tsugi_catalog where next_refresh<now() order by next_refresh limit 6 for update skip locked)
  returning *;
$$;
revoke all on function public.tsugi_claim_refresh() from public,anon,authenticated;
grant execute on function public.tsugi_claim_refresh() to service_role;
-- A dedicated server-only scheduler secret; never sent to browsers or source control.
create table public.tsugi_job_config (id integer primary key check(id=1), secret text not null);
alter table public.tsugi_job_config enable row level security;
revoke all on public.tsugi_job_config from anon,authenticated;
grant select on public.tsugi_job_config to service_role;
insert into public.tsugi_job_config values(1,gen_random_uuid()::text||gen_random_uuid()::text);
commit;
