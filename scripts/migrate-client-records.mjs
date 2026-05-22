import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL. Use the Neon pooled connection string.");
}

const sql = neon(databaseUrl);

await sql`create schema if not exists core`;

await sql`
  create table if not exists core.clients (
    client_key text primary key,
    client text not null,
    website text,
    location text,
    industry text,
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
  )
`;

await sql`create index if not exists clients_status_idx on core.clients (status)`;
await sql`create index if not exists clients_pod_idx on core.clients (pod)`;
await sql`create index if not exists clients_industry_idx on core.clients (industry)`;
await sql`create index if not exists clients_start_date_idx on core.clients (start_date)`;
await sql`create index if not exists clients_launch_date_idx on core.clients (launch_date)`;

await sql`
  create or replace function core.touch_updated_at()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql
`;

await sql`drop trigger if exists clients_touch_updated_at on core.clients`;

await sql`
  create trigger clients_touch_updated_at
  before update on core.clients
  for each row
  execute function core.touch_updated_at()
`;

console.log(JSON.stringify({ migrated: true, schema: "core", table: "clients" }, null, 2));
