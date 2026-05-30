import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const FIELD_TO_COLUMN = {
  "Client": "client",
  "Website": "website",
  "Location": "location",
  "Industry": "industry",
  "Practice Type": "practice_type",
  "Pod": "pod",
  "Start Date": "start_date",
  "Launch Date": "launch_date",
  "Services": "services",
  "Status": "status",
  "Monday Item": "monday_item",
  "GA4 Property ID": "ga4_property_id",
  "GSC Property": "gsc_property",
  "GSC Google Search Console Secondary Locations": "gsc_secondary_locations",
  "GBP Business Name": "gbp_business_name",
  "GBP Link": "gbp_link",
  "Folder": "folder",
  "Web Build Sheet": "web_build_sheet",
  "Site Sitemap XML": "site_sitemap_xml",
  "Geo Targets Done": "geo_targets_done",
  "Geo Targets Planned": "geo_targets_planned",
  "WhatConverts Account ID": "whatconverts_account_id",
  "WhatConverts Account Name": "whatconverts_account_name",
  "WhatConverts Profile ID": "whatconverts_profile_id",
  "WhatConverts Profile Name": "whatconverts_profile_name",
  "Notes": "notes"
};

const COLUMN_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_TO_COLUMN).map(([field, column]) => [column, field])
);

function usage() {
  console.log(`Usage:
  node scripts/client-records-direct.mjs search <query>
  node scripts/client-records-direct.mjs get <client-name-or-key>
  node scripts/client-records-direct.mjs upsert --field "Client=Example" --field "Website=https://example.com/" --field "Practice Type=general dentist"

Notes:
  - Loads .env.local automatically when present.
  - Writes directly to Neon/Postgres core.clients.
  - Practice Type must be one of: ${[...PRACTICE_TYPES].join(", ")}.
  - Never prints database connection strings.`);
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toSqlDate(value) {
  const clean = normalizeSpace(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

const PRACTICE_TYPES = new Set([
  "general dentist",
  "family dentist",
  "pediatric dentist",
  "orthodontist",
  "oral surgeon",
  "periodontist",
  "dental implants provider",
  "other",
  "employment lawyer"
]);

function normalizeFieldValue(field, value) {
  const clean = normalizeSpace(value);
  if (field !== "Practice Type" || !clean) return clean;
  const normalized = clean.toLowerCase();
  if (!PRACTICE_TYPES.has(normalized)) {
    throw new Error(`Unsupported Practice Type: ${clean}`);
  }
  return normalized;
}

function formatSqlDate(value) {
  if (!(value instanceof Date)) return value ?? "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.CLIENTS_DB_DATABASE_URL ||
    process.env.CLIENTS_DB_POSTGRES_URL ||
    process.env.CLIENTS_DB_URL
  );
}

function getSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing database URL. Pull Vercel env vars or create .env.local first.");
  }
  return neon(databaseUrl);
}

function rowToFields(row) {
  const output = {};
  for (const [column, value] of Object.entries(row)) {
    const field = COLUMN_TO_FIELD[column];
    if (!field) continue;
    if (value instanceof Date) {
      output[field] = formatSqlDate(value);
    } else {
      output[field] = value ?? "";
    }
  }
  output._client_key = row.client_key;
  output._updated_at = row.updated_at?.toISOString?.() || row.updated_at || "";
  return output;
}

function parseFieldArgs(args) {
  const row = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--field") continue;
    const assignment = args[index + 1];
    index += 1;
    const equalsIndex = assignment?.indexOf("=");
    if (!assignment || equalsIndex === -1) {
      throw new Error('Each --field must look like "Field Name=value".');
    }
    const field = assignment.slice(0, equalsIndex).trim();
    const value = normalizeFieldValue(field, assignment.slice(equalsIndex + 1));
    if (!FIELD_TO_COLUMN[field]) {
      throw new Error(`Unsupported field: ${field}`);
    }
    row[field] = value;
  }
  return row;
}

async function searchClients(sql, query) {
  const like = `%${query}%`;
  const rows = await sql`
    select client_key, client, website, practice_type, pod, services, status, monday_item, updated_at
    from core.clients
    where client ilike ${like}
       or website ilike ${like}
       or notes ilike ${like}
       or gbp_business_name ilike ${like}
    order by lower(client)
    limit 25
  `;
  return rows;
}

async function getClient(sql, value) {
  const key = slugify(value);
  const rows = await sql`
    select *
    from core.clients
    where client_key = ${key}
       or lower(client) = lower(${value})
    limit 1
  `;
  return rows[0] || null;
}

async function upsertClient(sql, fields) {
  if (!fields.Client) {
    throw new Error('Upsert requires --field "Client=..."');
  }

  const clientKey = slugify(fields.Client);
  const values = {
    client_key: clientKey,
    source_payload: JSON.stringify(fields)
  };

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const raw = fields[field] ?? "";
    values[column] = column.endsWith("_date") ? toSqlDate(raw) : normalizeFieldValue(field, raw);
  }

  const changedBy = process.env.CLIENT_RECORDS_CHANGED_BY || "codex-direct-db";
  const statements = [
    sql`select set_config('app.changed_by', ${changedBy}, true)`,
    sql`
      insert into core.clients (
        client_key,
        client,
        website,
        location,
        industry,
        practice_type,
        pod,
        start_date,
        launch_date,
        services,
        status,
        monday_item,
        ga4_property_id,
        gsc_property,
        gsc_secondary_locations,
        gbp_business_name,
        gbp_link,
        folder,
        web_build_sheet,
        site_sitemap_xml,
        geo_targets_done,
        geo_targets_planned,
        whatconverts_account_id,
        whatconverts_account_name,
        whatconverts_profile_id,
        whatconverts_profile_name,
        notes,
        source_payload
      ) values (
        ${values.client_key},
        ${values.client},
        ${values.website},
        ${values.location},
        ${values.industry},
        ${values.practice_type},
        ${values.pod},
        ${values.start_date},
        ${values.launch_date},
        ${values.services},
        ${values.status},
        ${values.monday_item},
        ${values.ga4_property_id},
        ${values.gsc_property},
        ${values.gsc_secondary_locations},
        ${values.gbp_business_name},
        ${values.gbp_link},
        ${values.folder},
        ${values.web_build_sheet},
        ${values.site_sitemap_xml},
        ${values.geo_targets_done},
        ${values.geo_targets_planned},
        ${values.whatconverts_account_id},
        ${values.whatconverts_account_name},
        ${values.whatconverts_profile_id},
        ${values.whatconverts_profile_name},
        ${values.notes},
        ${values.source_payload}::jsonb
      )
      on conflict (client_key) do update set
        client = excluded.client,
        website = coalesce(nullif(excluded.website, ''), core.clients.website),
        location = coalesce(nullif(excluded.location, ''), core.clients.location),
        industry = coalesce(nullif(excluded.industry, ''), core.clients.industry),
        practice_type = coalesce(nullif(excluded.practice_type, ''), core.clients.practice_type),
        pod = coalesce(nullif(excluded.pod, ''), core.clients.pod),
        start_date = coalesce(excluded.start_date, core.clients.start_date),
        launch_date = coalesce(excluded.launch_date, core.clients.launch_date),
        services = coalesce(nullif(excluded.services, ''), core.clients.services),
        status = coalesce(nullif(excluded.status, ''), core.clients.status),
        monday_item = coalesce(nullif(excluded.monday_item, ''), core.clients.monday_item),
        ga4_property_id = coalesce(nullif(excluded.ga4_property_id, ''), core.clients.ga4_property_id),
        gsc_property = coalesce(nullif(excluded.gsc_property, ''), core.clients.gsc_property),
        gsc_secondary_locations = coalesce(nullif(excluded.gsc_secondary_locations, ''), core.clients.gsc_secondary_locations),
        gbp_business_name = coalesce(nullif(excluded.gbp_business_name, ''), core.clients.gbp_business_name),
        gbp_link = coalesce(nullif(excluded.gbp_link, ''), core.clients.gbp_link),
        folder = coalesce(nullif(excluded.folder, ''), core.clients.folder),
        web_build_sheet = coalesce(nullif(excluded.web_build_sheet, ''), core.clients.web_build_sheet),
        site_sitemap_xml = coalesce(nullif(excluded.site_sitemap_xml, ''), core.clients.site_sitemap_xml),
        geo_targets_done = coalesce(nullif(excluded.geo_targets_done, ''), core.clients.geo_targets_done),
        geo_targets_planned = coalesce(nullif(excluded.geo_targets_planned, ''), core.clients.geo_targets_planned),
        whatconverts_account_id = coalesce(nullif(excluded.whatconverts_account_id, ''), core.clients.whatconverts_account_id),
        whatconverts_account_name = coalesce(nullif(excluded.whatconverts_account_name, ''), core.clients.whatconverts_account_name),
        whatconverts_profile_id = coalesce(nullif(excluded.whatconverts_profile_id, ''), core.clients.whatconverts_profile_id),
        whatconverts_profile_name = coalesce(nullif(excluded.whatconverts_profile_name, ''), core.clients.whatconverts_profile_name),
        notes = coalesce(nullif(excluded.notes, ''), core.clients.notes),
        source_payload = coalesce(core.clients.source_payload, '{}'::jsonb) || excluded.source_payload
      returning *
    `
  ];

  const [, result] = await sql.transaction(statements);
  return result[0];
}

await loadEnvFile();

const [command, ...args] = process.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  usage();
  process.exit(0);
}

const sql = getSql();

if (command === "search") {
  const query = args.join(" ").trim();
  if (!query) throw new Error("Search requires a query.");
  const rows = await searchClients(sql, query);
  console.log(JSON.stringify({ count: rows.length, clients: rows }, null, 2));
} else if (command === "get") {
  const value = args.join(" ").trim();
  if (!value) throw new Error("Get requires a client name or key.");
  const row = await getClient(sql, value);
  console.log(JSON.stringify(row ? rowToFields(row) : null, null, 2));
} else if (command === "upsert") {
  const fields = parseFieldArgs(args);
  const row = await upsertClient(sql, fields);
  console.log(JSON.stringify({ upserted: rowToFields(row) }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
