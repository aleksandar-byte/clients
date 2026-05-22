import { neon } from "@neondatabase/serverless";

let cachedSql;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!cachedSql) {
    cachedSql = neon(process.env.DATABASE_URL);
  }
  return cachedSql;
}

function dateToText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export async function listClientRecords() {
  const sql = getSql();
  if (!sql) {
    return null;
  }

  const rows = await sql`
    select
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
      updated_at
    from core.clients
    order by lower(client)
  `;

  return rows.map((row) => ({
    "Client": row.client || "",
    "Website": row.website || "",
    "Location": row.location || "",
    "Industry": row.industry || "",
    "Pod": row.pod || "",
    "Start Date": dateToText(row.start_date),
    "Launch Date": dateToText(row.launch_date),
    "Services": row.services || "",
    "Status": row.status || "",
    "Monday Item": row.monday_item || "",
    "GA4 Property ID": row.ga4_property_id || "",
    "GSC Property": row.gsc_property || "",
    "GSC Google Search Console Secondary Locations": row.gsc_secondary_locations || "",
    "GBP Business Name": row.gbp_business_name || "",
    "GBP Link": row.gbp_link || "",
    "Folder": row.folder || "",
    "Web Build Sheet": row.web_build_sheet || "",
    "Site Sitemap XML": row.site_sitemap_xml || "",
    "Geo Targets Done": row.geo_targets_done || "",
    "Geo Targets Planned": row.geo_targets_planned || "",
    "WhatConverts Account ID": row.whatconverts_account_id || "",
    "WhatConverts Account Name": row.whatconverts_account_name || "",
    "WhatConverts Profile ID": row.whatconverts_profile_id || "",
    "WhatConverts Profile Name": row.whatconverts_profile_name || "",
    "Notes": row.notes || "",
    "_client_key": row.client_key,
    "_updated_at": row.updated_at ? row.updated_at.toISOString() : ""
  }));
}
