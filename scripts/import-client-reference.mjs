import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const FIELD_TO_COLUMN = {
  "Client": "client",
  "Website": "website",
  "Location": "location",
  "Industry": "industry",
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

function parseMarkdownRow(line) {
  const trimmed = line.trim();
  const body = trimmed.startsWith("|") ? trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined) : trimmed;
  const cells = [];
  let current = "";
  let escaped = false;
  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(normalizeSpace(current));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(normalizeSpace(current));
  return cells;
}

function looksLikeSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseClientReference(markdown) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.includes("| Client | Website |"));
  if (startIndex === -1) {
    throw new Error("Could not find the canonical client table in client-reference.md");
  }

  const header = parseMarkdownRow(lines[startIndex]);
  const rows = [];

  for (const line of lines.slice(startIndex + 1)) {
    if (!line.trim().startsWith("|")) break;
    const cells = parseMarkdownRow(line);
    if (looksLikeSeparator(cells)) continue;
    const row = {};
    header.forEach((field, index) => {
      row[field] = cells[index] || "";
    });
    if (row.Client) rows.push(row);
  }

  return rows;
}

function toSqlDate(value) {
  const clean = normalizeSpace(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL. Use the Neon pooled connection string.");
}

const inputPath = path.resolve(process.argv[2] || "../../client-reference.md");
const markdown = await readFile(inputPath, "utf8");
const rows = parseClientReference(markdown);
const sql = neon(databaseUrl);

await sql.transaction(rows.map((row) => {
  const clientKey = slugify(row.Client);
  const values = {
    client_key: clientKey,
    source_payload: JSON.stringify(row)
  };

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    values[column] = column.endsWith("_date") ? toSqlDate(row[field]) : normalizeSpace(row[field]);
  }

  return sql`
    insert into core.clients (
      client_key,
      client,
      website,
      location,
      industry,
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
      website = excluded.website,
      location = excluded.location,
      industry = excluded.industry,
      pod = excluded.pod,
      start_date = excluded.start_date,
      launch_date = excluded.launch_date,
      services = excluded.services,
      status = excluded.status,
      monday_item = excluded.monday_item,
      ga4_property_id = excluded.ga4_property_id,
      gsc_property = excluded.gsc_property,
      gsc_secondary_locations = excluded.gsc_secondary_locations,
      gbp_business_name = excluded.gbp_business_name,
      gbp_link = excluded.gbp_link,
      folder = excluded.folder,
      web_build_sheet = excluded.web_build_sheet,
      site_sitemap_xml = excluded.site_sitemap_xml,
      geo_targets_done = excluded.geo_targets_done,
      geo_targets_planned = excluded.geo_targets_planned,
      whatconverts_account_id = excluded.whatconverts_account_id,
      whatconverts_account_name = excluded.whatconverts_account_name,
      whatconverts_profile_id = excluded.whatconverts_profile_id,
      whatconverts_profile_name = excluded.whatconverts_profile_name,
      notes = excluded.notes,
      source_payload = excluded.source_payload
  `;
}));

console.log(JSON.stringify({ imported: rows.length, source: inputPath }, null, 2));
