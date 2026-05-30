import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

async function loadEnvFile() {
  const envPath = path.resolve(".env.local");
  if (!existsSync(envPath)) return;

  const body = await readFile(envPath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const name = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
}

await loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
const prefixedDatabaseUrl =
  process.env.CLIENTS_DB_DATABASE_URL ||
  process.env.CLIENTS_DB_POSTGRES_URL ||
  process.env.CLIENTS_DB_URL ||
  process.env.POSTGRES_URL;

if (!databaseUrl && !prefixedDatabaseUrl) {
  throw new Error("Missing DATABASE_URL or CLIENTS_DB_DATABASE_URL. Use the Neon pooled connection string.");
}

const sql = neon(databaseUrl || prefixedDatabaseUrl);

await sql`create schema if not exists core`;

await sql`
  create table if not exists core.clients (
    client_key text primary key,
    client text not null,
    website text,
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
  )
`;

await sql`create index if not exists clients_status_idx on core.clients (status)`;
await sql`create index if not exists clients_pod_idx on core.clients (pod)`;
await sql`alter table core.clients add column if not exists practice_type text`;

await sql`create index if not exists clients_industry_idx on core.clients (industry)`;
await sql`create index if not exists clients_practice_type_idx on core.clients (practice_type)`;
await sql`create index if not exists clients_start_date_idx on core.clients (start_date)`;
await sql`create index if not exists clients_launch_date_idx on core.clients (launch_date)`;

await sql`
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
  end $$
`;

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
