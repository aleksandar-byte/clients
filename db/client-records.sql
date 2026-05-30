create schema if not exists core;

create table if not exists core.clients (
  client_key text primary key,
  client text not null,
  website text,
  homepage_title text,
  homepage_meta_description text,
  homepage_checked_at timestamptz,
  location text,
  industry text,
  practice_type text,
  pod text,
  start_date date,
  launch_date date,
  services text,
  status text,
  monday_item text,
  ga4_property_id text,
  gsc_property text,
  gsc_secondary_locations text,
  gbp_business_name text,
  gbp_link text,
  folder text,
  web_build_sheet text,
  site_sitemap_xml text,
  geo_targets_done text,
  geo_targets_planned text,
  whatconverts_account_id text,
  whatconverts_account_name text,
  whatconverts_profile_id text,
  whatconverts_profile_name text,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_idx on core.clients (status);
create index if not exists clients_pod_idx on core.clients (pod);
alter table core.clients
  add column if not exists practice_type text;

alter table core.clients
  add column if not exists homepage_title text,
  add column if not exists homepage_meta_description text,
  add column if not exists homepage_checked_at timestamptz;

create index if not exists clients_industry_idx on core.clients (industry);
create index if not exists clients_practice_type_idx on core.clients (practice_type);
create index if not exists clients_start_date_idx on core.clients (start_date);
create index if not exists clients_launch_date_idx on core.clients (launch_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_practice_type_check'
      and conrelid = 'core.clients'::regclass
  ) then
    alter table core.clients
      add constraint clients_practice_type_check
      check (
        practice_type is null
        or practice_type = ''
        or lower(practice_type) in (
          'general dentist',
          'family dentist',
          'pediatric dentist',
          'orthodontist',
          'oral surgeon',
          'periodontist',
          'dental implants provider',
          'other',
          'employment lawyer'
        )
      );
  end if;
end $$;

create or replace function core.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_touch_updated_at on core.clients;
create trigger clients_touch_updated_at
before update on core.clients
for each row
execute function core.touch_updated_at();
