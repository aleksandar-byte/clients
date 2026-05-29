function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return normalizeSpace(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function dash(value) {
  return escapeHtml(value || "-");
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function statusKey(status) {
  const value = normalizeSpace(status).toLowerCase();
  if (value === "active") return "active";
  if (value === "paused") return "paused";
  if (["lost / churned", "stopped", "lost"].includes(value)) return "lost";
  if (value === "needs review") return "review";
  return "unknown";
}

function serviceTokens(row) {
  return normalizeSpace(row["Services"])
    .toLowerCase()
    .split(/[,/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasSeoService(row) {
  return serviceTokens(row).some((token) => token === "seo" || token.startsWith("seo "));
}

function isHostingOnly(row) {
  const services = normalizeSpace(row["Services"]).toLowerCase();
  return services.includes("hosting") && !hasSeoService(row);
}

function effectiveStatusKey(row) {
  const rawStatus = statusKey(row["Status"]);
  if (rawStatus === "active" && isHostingOnly(row)) return "paused";
  return rawStatus;
}

function effectiveStatusLabel(row) {
  const rawStatus = statusKey(row["Status"]);
  if (rawStatus === "active" && isHostingOnly(row)) return "Paused";
  return normalizeSpace(row["Status"]) || "Unmarked";
}

function isActiveSeo(row) {
  return effectiveStatusKey(row) === "active" && hasSeoService(row);
}

function renderLink(label, url) {
  const clean = normalizeSpace(url);
  if (!clean) return "";
  return `<a href="${escapeHtml(clean)}" target="_blank" rel="noreferrer" class="lnk">${escapeHtml(label)}</a>`;
}

function renderLinks(row) {
  return [
    renderLink("www", row["Website"]),
    renderLink("GBP", row["GBP Link"]),
    renderLink("drive", row["Folder"]),
    renderLink("build sheet", row["Web Build Sheet"]),
    renderLink("xml", row["Site Sitemap XML"])
  ].filter(Boolean).join("") || '<span class="muted">no links</span>';
}

function splitChips(value) {
  const parts = normalizeSpace(value).split(",").map((item) => item.trim()).filter(Boolean);
  const chips = [];
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index];
    const maybeState = parts[index + 1];
    if (maybeState && maybeState.length >= 2 && maybeState.length <= 3 && maybeState === maybeState.toUpperCase()) {
      chips.push(`${current}, ${maybeState}`);
      index += 1;
    } else {
      chips.push(current);
    }
  }
  return chips;
}

function renderGeoChips(done, planned) {
  const doneChips = splitChips(done).map((item) => `<span class="geo-chip geo-done">${escapeHtml(item)}</span>`);
  const plannedChips = splitChips(planned).map((item) => `<span class="geo-chip geo-planned">${escapeHtml(item)}</span>`);
  return [...doneChips, ...plannedChips].join("") || '<span class="muted">no geo targets</span>';
}

function summarise(rows) {
  const total = rows.length;
  const active = rows.filter((row) => effectiveStatusKey(row) === "active").length;
  const activeSeo = rows.filter(isActiveSeo).length;
  const paused = rows.filter((row) => effectiveStatusKey(row) === "paused").length;
  const lost = rows.filter((row) => effectiveStatusKey(row) === "lost").length;
  const review = rows.filter((row) => effectiveStatusKey(row) === "review").length;
  const white = rows.filter((row) => normalizeSpace(row["Pod"]) === "White" && isActiveSeo(row)).length;
  const orange = rows.filter((row) => normalizeSpace(row["Pod"]) === "Orange" && isActiveSeo(row)).length;
  return {
    total,
    active,
    activeSeo,
    inactive: paused + lost,
    review,
    white,
    orange,
    activeSeoPct: pct(activeSeo, total),
    whitePct: pct(white, activeSeo),
    orangePct: pct(orange, activeSeo)
  };
}

function renderRows(rows) {
  return rows.map((row, index) => {
    const clientName = normalizeSpace(row["Client"]);
    const status = effectiveStatusLabel(row);
    const statusClass = effectiveStatusKey(row);
    const activeSeo = isActiveSeo(row) ? "true" : "false";
    const pod = normalizeSpace(row["Pod"]);
    const industry = normalizeSpace(row["Industry"]);
    const location = normalizeSpace(row["Location"]);
    const services = normalizeSpace(row["Services"]);
    const startDate = normalizeSpace(row["Start Date"]);
    const launchDate = normalizeSpace(row["Launch Date"]);
    const gbpBusinessName = normalizeSpace(row["GBP Business Name"]);
    const notes = normalizeSpace(row["Notes"]);
    const webBuildSheet = normalizeSpace(row["Web Build Sheet"]);
    const siteSitemapXml = normalizeSpace(row["Site Sitemap XML"]);
    const geoDone = normalizeSpace(row["Geo Targets Done"]);
    const geoPlanned = normalizeSpace(row["Geo Targets Planned"]);
    const gscSecondary = normalizeSpace(row["GSC Google Search Console Secondary Locations"]);
    const searchText = [
      clientName,
      gbpBusinessName,
      location,
      industry,
      pod,
      services,
      status,
      geoDone,
      geoPlanned,
      notes,
      row["GBP Link"],
      webBuildSheet,
      siteSitemapXml
    ].join(" ").toLowerCase();
    const links = renderLinks(row);
    const entryNo = String(index + 1).padStart(3, "0");
    return `
      <tr class="row" data-status="${statusClass}" data-active-seo="${activeSeo}" data-pod="${escapeHtml(pod.toLowerCase())}" data-industry="${escapeHtml(industry.toLowerCase())}" data-search="${escapeHtml(searchText)}" data-sort-name="${escapeHtml(clientName.toLowerCase())}" data-sort-date="${escapeHtml(startDate || launchDate)}">
        <td class="cell-client"><span class="entry-num">No. ${entryNo}</span><strong>${escapeHtml(clientName)}</strong><div class="client-links">${links}</div></td>
        <td>${dash(gbpBusinessName)}</td>
        <td>${dash(location)}</td>
        <td class="extra-col">${dash(industry)}</td>
        <td><span class="pod pod-${escapeHtml(pod.toLowerCase() || "none")}">${dash(pod)}</span></td>
        <td class="extra-col mono">${dash(startDate)}</td>
        <td class="extra-col mono">${dash(launchDate)}</td>
        <td class="extra-col">${dash(services)}</td>
        <td><span class="badge badge-${statusClass}"><span class="dot"></span>${escapeHtml(status)}</span></td>
        <td class="api-key-col mono">${dash(row["Monday Item"])}</td>
        <td class="api-key-col mono">${dash(row["GA4 Property ID"])}</td>
        <td class="api-key-col mono">${dash(row["GSC Property"])}</td>
        <td class="api-key-col wide">${dash(gscSecondary)}</td>
        <td class="api-key-col mono">${dash(row["WhatConverts Account ID"])}</td>
        <td class="api-key-col">${dash(row["WhatConverts Account Name"])}</td>
        <td class="api-key-col mono">${dash(row["WhatConverts Profile ID"])}</td>
        <td class="api-key-col">${dash(row["WhatConverts Profile Name"])}</td>
        <td class="extra-col wide">${dash(webBuildSheet)}</td>
        <td class="extra-col wide">${dash(siteSitemapXml)}</td>
        <td class="geo-cell wide">${renderGeoChips(geoDone, geoPlanned)}</td>
        <td class="notes-col wide">${dash(notes)}</td>
      </tr>`;
  }).join("");
}

function renderCards(rows) {
  return rows.map((row, index) => {
    const clientName = normalizeSpace(row["Client"]);
    const status = effectiveStatusLabel(row);
    const statusClass = effectiveStatusKey(row);
    const activeSeo = isActiveSeo(row) ? "true" : "false";
    const pod = normalizeSpace(row["Pod"]);
    const industry = normalizeSpace(row["Industry"]);
    const location = normalizeSpace(row["Location"]);
    const startDate = normalizeSpace(row["Start Date"]);
    const launchDate = normalizeSpace(row["Launch Date"]);
    const gbpBusinessName = normalizeSpace(row["GBP Business Name"]);
    const geoDone = normalizeSpace(row["Geo Targets Done"]);
    const geoPlanned = normalizeSpace(row["Geo Targets Planned"]);
    const notes = normalizeSpace(row["Notes"]);
    const searchText = [
      clientName,
      gbpBusinessName,
      location,
      industry,
      pod,
      row["Services"],
      status,
      geoDone,
      geoPlanned,
      notes
    ].join(" ").toLowerCase();
    const entryNo = String(index + 1).padStart(3, "0");
    return `
      <article class="card-item" data-status="${statusClass}" data-active-seo="${activeSeo}" data-pod="${escapeHtml(pod.toLowerCase())}" data-industry="${escapeHtml(industry.toLowerCase())}" data-search="${escapeHtml(searchText)}" data-sort-name="${escapeHtml(clientName.toLowerCase())}" data-sort-date="${escapeHtml(startDate || launchDate)}">
        <div class="card-corner"><span class="entry-num">No. ${entryNo}</span><span class="badge badge-${statusClass}"><span class="dot"></span>${escapeHtml(status)}</span></div>
        <h3>${escapeHtml(clientName)}</h3>
        <div class="card-meta">${dash(gbpBusinessName)} <span>/</span> ${dash(location)} <span>/</span> ${dash(industry)} <span>/</span> ${dash(pod)}</div>
        <dl class="card-grid">
          <div class="extra-col"><dt>Started</dt><dd class="mono">${dash(startDate)}</dd></div>
          <div class="extra-col"><dt>Launched</dt><dd class="mono">${dash(launchDate)}</dd></div>
          <div class="extra-col"><dt>Services</dt><dd>${dash(row["Services"])}</dd></div>
          <div class="api-key-col"><dt>Monday</dt><dd class="mono">${dash(row["Monday Item"])}</dd></div>
          <div class="api-key-col"><dt>GA4</dt><dd class="mono">${dash(row["GA4 Property ID"])}</dd></div>
          <div class="api-key-col span-2"><dt>GSC</dt><dd class="mono truncate">${dash(row["GSC Property"])}</dd></div>
          <div class="api-key-col span-2"><dt>GSC secondary locations</dt><dd class="truncate">${dash(row["GSC Google Search Console Secondary Locations"])}</dd></div>
          <div class="api-key-col"><dt>WC account ID</dt><dd class="mono">${dash(row["WhatConverts Account ID"])}</dd></div>
          <div class="api-key-col"><dt>WC profile ID</dt><dd class="mono">${dash(row["WhatConverts Profile ID"])}</dd></div>
          <div class="api-key-col span-2"><dt>WC account</dt><dd class="truncate">${dash(row["WhatConverts Account Name"])}</dd></div>
          <div class="api-key-col span-2"><dt>WC profile</dt><dd class="truncate">${dash(row["WhatConverts Profile Name"])}</dd></div>
          <div class="extra-col span-2"><dt>Web build sheet</dt><dd class="truncate">${dash(row["Web Build Sheet"])}</dd></div>
          <div class="extra-col span-2"><dt>Site sitemap XML</dt><dd class="truncate">${dash(row["Site Sitemap XML"])}</dd></div>
          <div class="span-2"><dt>Geo targets</dt><dd class="geo-cell">${renderGeoChips(geoDone, geoPlanned)}</dd></div>
          <div class="notes-col span-2"><dt>Notes</dt><dd class="truncate">${dash(notes)}</dd></div>
        </dl>
        <footer>${renderLinks(row)}</footer>
      </article>`;
  }).join("");
}

export function renderClientRecordsHtml(rows, options = {}) {
  const summary = summarise(rows);
  const issued = new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const industries = [...new Set(rows.map((row) => normalizeSpace(row["Industry"])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const industryOptions = industries
    .map((industry) => `<option value="${escapeHtml(industry.toLowerCase())}">${escapeHtml(industry)}</option>`)
    .join("");
  const sourceDescription = options.sourceDescription || "Generated from Neon Postgres table <code>core.clients</code>.";
  const latestUpdate = rows.map((row) => row._updated_at).filter(Boolean).sort().at(-1);
  const freshness = latestUpdate ? `Latest DB update: ${escapeHtml(latestUpdate.slice(0, 10))}` : "Live Neon source";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Client Records - The Roster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#f1ece0; --paper-soft:#f7f3e9; --surface:#fdfaf2; --ink:#15140e; --muted:#8a8473; --line:#d8d0bc; --line-2:#c8bfa7; --accent:#c14a1d; --forest:#2d4a37; --blue:#1f3a5f; --amber:#a06814; --crimson:#952820; --shadow:0 24px 56px -24px rgba(21,20,14,.34); }
    * { box-sizing:border-box; } body { margin:0; color:var(--ink); font:14px/1.45 "IBM Plex Sans", system-ui, sans-serif; background:var(--paper); background-image:radial-gradient(circle at 18% 20%, rgba(193,74,29,.045), transparent 40%), radial-gradient(circle at 90% 110%, rgba(45,74,55,.05), transparent 45%); } a { color:inherit; }
    .app { display:grid; grid-template-columns:240px minmax(0, 1fr); min-height:100vh; } .sidebar { position:sticky; top:0; height:100vh; overflow:auto; background:var(--ink); color:#c8c4b6; padding:28px 20px; display:flex; flex-direction:column; gap:26px; }
    .brand { font:500 22px/1 "Fraunces", serif; color:var(--paper); letter-spacing:-.02em; } .brand span { color:var(--accent); font-style:italic; } .brand-sub, .side-section h4, .side-foot, .topbar-meta, .mono, .entry-num, .toolbar-label, .meta-tag { font-family:"IBM Plex Mono", monospace; }
    .brand-sub { margin-top:6px; font-size:9.5px; letter-spacing:.18em; text-transform:uppercase; color:#6e6856; } .side-section h4 { margin:0 0 10px; padding-left:10px; font-size:9.5px; font-weight:500; letter-spacing:.18em; text-transform:uppercase; color:#6e6856; }
    .side-link { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-radius:5px; cursor:pointer; color:#c8c4b6; } .side-link:hover, .side-link.active { background:#1f1d14; color:var(--paper); } .side-link .count { font-family:"IBM Plex Mono", monospace; font-size:11px; color:#8a8473; } .side-link.active .count { color:var(--accent); }
    .pod-tag { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:9px; vertical-align:middle; } .pod-white-bg { background:#93b5e1; } .pod-orange-bg { background:#e08a5c; } .side-foot { margin-top:auto; padding-top:14px; border-top:1px solid #2a281e; color:#6e6856; font-size:10.5px; line-height:1.7; } .side-foot .meta { color:#c8c4b6; }
    .main { min-width:0; } .topbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:14px; padding:12px 36px; background:rgba(241,236,224,.94); border-bottom:1px solid var(--line); backdrop-filter:saturate(140%); } .search { flex:1; max-width:480px; position:relative; } .search input { width:100%; padding:9px 42px 9px 14px; border:1px solid var(--line); border-radius:4px; background:var(--surface); font:inherit; outline:none; } .kbd { position:absolute; right:10px; top:50%; transform:translateY(-50%); border:1px solid var(--line); padding:1px 6px; border-radius:3px; color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10.5px; } .topbar-spacer { flex:1; } .topbar-meta { font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
    .view-toggle { display:flex; border:1px solid var(--line); border-radius:4px; overflow:hidden; } .view-toggle button { border:0; border-right:1px solid var(--line); background:var(--surface); padding:8px 12px; cursor:pointer; font-family:"IBM Plex Mono", monospace; font-size:11px; letter-spacing:.06em; color:var(--muted); } .view-toggle button:last-child { border-right:0; } .view-toggle button.active { background:var(--ink); color:var(--paper); }
    .masthead { padding:42px 36px 26px; border-bottom:1px solid var(--line); } .spec-strip { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; } .title-grid { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:36px; margin-top:24px; align-items:end; } h1 { margin:0; font:500 clamp(42px, 8vw, 104px)/.9 "Fraunces", serif; letter-spacing:-.055em; } h1 em { color:var(--accent); font-style:italic; } .title-deck { color:#5a564b; font-size:18px; max-width:360px; } .lede { max-width:880px; color:#5a564b; margin:24px 0 0; }
    .stats { display:grid; grid-template-columns:1.35fr repeat(2, 1fr); gap:12px; margin-top:28px; } .stat { background:var(--surface); border:1px solid var(--line); padding:16px; box-shadow:var(--shadow); min-height:124px; } .stat-click { cursor:pointer; text-align:left; color:inherit; font:inherit; } .stat-click:hover { border-color:var(--accent); transform:translateY(-1px); } .stat-label { color:var(--muted); text-transform:uppercase; font-family:"IBM Plex Mono", monospace; font-size:10px; letter-spacing:.14em; } .stat-value { font:600 42px/1 "Fraunces", serif; margin-top:12px; } .stat-trend { color:#5a564b; font-size:12px; margin-top:8px; } .stat-bar { height:4px; background:var(--line); margin-top:14px; } .stat-bar span { display:block; height:100%; }
    .workspace { padding:28px 36px 48px; } .section-head { display:flex; align-items:center; gap:16px; margin-bottom:16px; } .section-head h2 { font:500 28px/1 "Fraunces", serif; margin:0; } .section-head h2 em { color:var(--accent); } .rule { flex:1; height:1px; background:var(--line); } .meta-tag { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.12em; } .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px; } .toolbar select, .chip, .toggle-field { border:1px solid var(--line); background:var(--surface); border-radius:4px; padding:8px 10px; font:inherit; color:var(--ink); } .toolbar-label, .results-count { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.1em; } .chip, .toggle-field { display:inline-flex; align-items:center; gap:8px; cursor:pointer; } .toggle-field input { margin:0; } .results-count { margin-left:auto; }
    .table-shell { background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); } .table-scroll { overflow:auto; max-height:78vh; } table { width:100%; min-width:1380px; border-collapse:separate; border-spacing:0; } th { position:sticky; top:0; z-index:2; background:#eee7d8; color:#5a564b; font:600 10px "IBM Plex Mono", monospace; letter-spacing:.12em; text-transform:uppercase; text-align:left; padding:12px; border-bottom:1px solid var(--line-2); } td { padding:13px 12px; border-bottom:1px solid var(--line); vertical-align:top; } tbody tr:hover { background:#faf5e8; }
    .cell-client { min-width:270px; } .cell-client strong { display:block; margin:4px 0 8px; } .entry-num { color:var(--muted); font-size:10px; letter-spacing:.1em; text-transform:uppercase; } .client-links, .card-item footer { display:flex; flex-wrap:wrap; gap:7px; } .lnk { text-decoration:none; border:1px solid var(--line); padding:3px 7px; border-radius:999px; color:var(--accent); font-size:11px; background:#fffaf0; } .badge { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px; white-space:nowrap; } .badge .dot { width:6px; height:6px; border-radius:50%; background:currentColor; } .badge-active { color:var(--forest); background:#cfddc7; } .badge-paused { color:var(--amber); background:#f0d99c; } .badge-lost { color:var(--crimson); background:#f0c9c2; } .badge-review { color:var(--blue); background:#cdd8e3; } .badge-unknown { color:#5a564b; background:#e8dfcc; } .pod { font-weight:700; } .pod-white { color:var(--blue); } .pod-orange { color:var(--accent); } .wide { min-width:240px; } .muted { color:var(--muted); } .truncate { overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; } .geo-cell { display:flex; flex-wrap:wrap; gap:6px; max-width:360px; } .geo-chip { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; line-height:1.2; } .geo-done { color:var(--forest); background:#cfddc7; border-color:#adc29f; } .geo-planned { color:var(--accent); background:#f3d9c6; border-color:#e3b596; } .api-key-col, .extra-col, .notes-col { display:none; } body.show-all-columns .api-key-col, body.show-all-columns .extra-col, body.show-notes .notes-col { display:table-cell; } body.show-all-columns .card-item .api-key-col, body.show-all-columns .card-item .extra-col, body.show-notes .card-item .notes-col { display:block; }
    .cards { display:none; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; } .cards.show { display:grid; } .card-item { background:var(--surface); border:1px solid var(--line); padding:16px; box-shadow:var(--shadow); } .card-corner { display:flex; justify-content:space-between; align-items:center; gap:12px; } .card-item h3 { margin:14px 0 6px; font:600 25px/1.05 "Fraunces", serif; } .card-meta { color:#5a564b; font-size:12px; } .card-meta span { color:var(--muted); margin:0 5px; } .card-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; } .card-grid dt { color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10px; text-transform:uppercase; letter-spacing:.1em; } .card-grid dd { margin:3px 0 0; } .span-2 { grid-column:1 / -1; } .empty { display:none; text-align:center; padding:50px; color:var(--muted); border:1px dashed var(--line-2); background:var(--surface); } .empty.show { display:block; } .hidden { display:none !important; }
    @media (max-width:960px) { .app { display:block; } .sidebar { position:relative; height:auto; } .topbar { padding:12px 16px; flex-wrap:wrap; } .topbar-meta, .kbd { display:none; } .masthead, .workspace { padding-left:16px; padding-right:16px; } .title-grid, .stats { grid-template-columns:1fr; } h1 { font-size:52px; } }
  </style>
</head>
<body><div class="app"><aside class="sidebar"><div><div class="brand">Roster<span>&amp;</span>Co.</div><div class="brand-sub">Client Records</div></div><div class="side-section"><h4>By Status</h4><div class="side-link" data-filter-type="status" data-filter-value=""><span>All clients</span><span class="count">${String(summary.total).padStart(3, "0")}</span></div><div class="side-link active" data-filter-type="status" data-filter-value="active-seo"><span>Active SEO</span><span class="count">${String(summary.activeSeo).padStart(3, "0")}</span></div><div class="side-link" data-filter-type="status" data-filter-value="active"><span>Active all</span><span class="count">${String(summary.active).padStart(3, "0")}</span></div><div class="side-link" data-filter-type="inactive" data-filter-value="true"><span>Paused / inactive</span><span class="count">${String(summary.inactive).padStart(3, "0")}</span></div><div class="side-link" data-filter-type="status" data-filter-value="review"><span>Needs review</span><span class="count">${String(summary.review).padStart(3, "0")}</span></div></div><div class="side-section"><h4>By Pod</h4><div class="side-link" data-filter-type="pod" data-filter-value="white"><span><span class="pod-tag pod-white-bg"></span>White Pod</span><span class="count">${String(summary.white).padStart(3, "0")}</span></div><div class="side-link" data-filter-type="pod" data-filter-value="orange"><span><span class="pod-tag pod-orange-bg"></span>Orange Pod</span><span class="count">${String(summary.orange).padStart(3, "0")}</span></div></div><div class="side-foot"><div><span class="meta">Source</span></div><div>Neon / core.clients</div><br><div><span class="meta">Rendered</span></div><div>${escapeHtml(issued)}</div><br><div>${freshness}</div></div></aside><main class="main"><div class="topbar"><div class="search"><input id="search" type="search" placeholder="Search clients, locations, geo, notes..." autocomplete="off"><span class="kbd">/</span></div><div class="topbar-spacer"></div><div class="topbar-meta">Active SEO / <strong>${summary.activeSeo} entries</strong></div><div class="view-toggle"><button id="view-table" class="active" type="button">Table</button><button id="view-cards" type="button">Cards</button></div></div><header class="masthead"><div class="spec-strip"><span>Issued <strong>${escapeHtml(issued)}</strong></span><span>/</span><span>Active SEO roster</span></div><div class="title-grid"><h1>The Roster, <em>annotated</em>.</h1><div class="title-deck">A live field guide to every client: sorted, searchable, linked, and backed by Neon.</div></div><p class="lede">${sourceDescription} Client data updates from the database. API identifiers are hidden unless you turn them on.</p><div class="stats"><button class="stat stat-click" type="button" data-stat-filter="active-seo"><div class="stat-label">Active SEO</div><div class="stat-value">${summary.activeSeo}</div><div class="stat-trend">Default working roster</div><div class="stat-bar"><span style="width:${summary.activeSeoPct}%;background:var(--forest)"></span></div></button><button class="stat stat-click" type="button" data-stat-filter="pod" data-pod-value="white"><div class="stat-label">White Pod SEO</div><div class="stat-value">${summary.white}</div><div class="stat-trend">${summary.whitePct}% of active SEO</div><div class="stat-bar"><span style="width:${summary.whitePct}%;background:var(--blue)"></span></div></button><button class="stat stat-click" type="button" data-stat-filter="pod" data-pod-value="orange"><div class="stat-label">Orange Pod SEO</div><div class="stat-value">${summary.orange}</div><div class="stat-trend">${summary.orangePct}% of active SEO</div><div class="stat-bar"><span style="width:${summary.orangePct}%;background:var(--accent)"></span></div></button></div></header><section class="workspace"><div class="section-head"><h2>The <em>full</em> ledger</h2><div class="rule"></div><div class="meta-tag" id="sort-meta">${summary.total} entries / sorted A-Z</div></div><div class="toolbar"><span class="toolbar-label">Filter -></span><select id="industry-filter"><option value="">All industries</option>${industryOptions}</select><select id="pod-filter"><option value="">All pods</option><option value="white">White pod</option><option value="orange">Orange pod</option></select><select id="status-filter"><option value="">All statuses</option><option value="active-seo" selected>Active SEO</option><option value="active">Active all</option><option value="inactive">Paused / inactive</option><option value="review">Needs review</option></select><select id="sort-filter"><option value="name-asc">Sort A-Z</option><option value="newest">Newest clients first</option><option value="oldest">Oldest clients first</option></select><label class="toggle-field"><input id="show-all-columns" type="checkbox"> Show all columns</label><label class="toggle-field"><input id="show-notes" type="checkbox"> Show notes</label><button class="chip" id="reset-btn" type="button" style="display:none;">Clear x</button><div class="results-count" id="results-count">Showing <strong>${summary.activeSeo}</strong> of ${summary.total}</div></div><div class="table-shell" id="table-view"><div class="table-scroll"><table><thead><tr><th>Client</th><th>GBP business name</th><th>Location</th><th class="extra-col">Industry</th><th>Pod</th><th class="extra-col">Started</th><th class="extra-col">Launched</th><th class="extra-col">Services</th><th>Status</th><th class="api-key-col">Monday</th><th class="api-key-col">GA4</th><th class="api-key-col">GSC</th><th class="api-key-col">GSC secondary locations</th><th class="api-key-col">WC account ID</th><th class="api-key-col">WC account</th><th class="api-key-col">WC profile ID</th><th class="api-key-col">WC profile</th><th class="extra-col">Web build sheet</th><th class="extra-col">Site XML</th><th>Geo targets</th><th class="notes-col">Notes</th></tr></thead><tbody id="rows">${renderRows(rows)}</tbody></table></div></div><div class="cards" id="card-view">${renderCards(rows)}</div><div class="empty" id="empty-state"><h3>Nothing in the ledger.</h3><p>Clear filters or search again.</p></div></section></main></div><script>(function(){const search=document.getElementById('search');const podFilter=document.getElementById('pod-filter');const statusFilter=document.getElementById('status-filter');const industryFilter=document.getElementById('industry-filter');const sortFilter=document.getElementById('sort-filter');const sortMeta=document.getElementById('sort-meta');const resetBtn=document.getElementById('reset-btn');const empty=document.getElementById('empty-state');const tableView=document.getElementById('table-view');const cardView=document.getElementById('card-view');const rowsBody=document.getElementById('rows');const sideLinks=document.querySelectorAll('.side-link');const viewTable=document.getElementById('view-table');const viewCards=document.getElementById('view-cards');const showAllColumns=document.getElementById('show-all-columns');const showNotes=document.getElementById('show-notes');const statFilters=document.querySelectorAll('[data-stat-filter]');const total=${summary.total};function dateValue(el){return Date.parse(el.dataset.sortDate||'')||0;}function sortNodes(parent,selector){const mode=sortFilter.value;const nodes=[...parent.querySelectorAll(selector)];nodes.sort((a,b)=>{if(mode==='newest')return dateValue(b)-dateValue(a)||a.dataset.sortName.localeCompare(b.dataset.sortName);if(mode==='oldest')return dateValue(a)-dateValue(b)||a.dataset.sortName.localeCompare(b.dataset.sortName);return a.dataset.sortName.localeCompare(b.dataset.sortName);});nodes.forEach(node=>parent.appendChild(node));}function applySort(){sortNodes(rowsBody,'.row');sortNodes(cardView,'.card-item');sortMeta.textContent=total+' entries / '+(sortFilter.value==='newest'?'newest first':sortFilter.value==='oldest'?'oldest first':'sorted A-Z');}function applyFilters(){applySort();const q=(search.value||'').trim().toLowerCase();const pod=podFilter.value;const status=statusFilter.value;const industry=industryFilter.value;const items=[...document.querySelectorAll('#rows .row'),...document.querySelectorAll('#card-view .card-item')];let visible=0;items.forEach(el=>{const matchesStatus=!status||el.dataset.status===status||(status==='active-seo'&&el.dataset.activeSeo==='true')||(status==='inactive'&&['paused','lost'].includes(el.dataset.status));const show=(!q||el.dataset.search.includes(q))&&(!pod||el.dataset.pod===pod)&&matchesStatus&&(!industry||el.dataset.industry===industry);el.classList.toggle('hidden',!show);if(show&&el.classList.contains('row'))visible++;});document.getElementById('results-count').innerHTML='Showing <strong>'+visible+'</strong> of '+total;resetBtn.style.display=(q||pod||status||industry||sortFilter.value!=='name-asc')?'inline-flex':'none';empty.classList.toggle('show',visible===0);tableView.style.display=visible===0?'none':(viewTable.classList.contains('active')?'':'none');cardView.style.display=visible===0?'none':(viewCards.classList.contains('active')?'grid':'none');sideLinks.forEach(link=>{const type=link.dataset.filterType;const value=link.dataset.filterValue;link.classList.toggle('active',(type==='status'&&value===status)||(type==='inactive'&&status==='inactive')||(type==='pod'&&value===pod)||(!value&&!status&&!pod&&type==='status'));});}search.addEventListener('input',applyFilters);podFilter.addEventListener('change',applyFilters);statusFilter.addEventListener('change',applyFilters);industryFilter.addEventListener('change',applyFilters);sortFilter.addEventListener('change',applyFilters);resetBtn.addEventListener('click',()=>{search.value='';podFilter.value='';statusFilter.value='';industryFilter.value='';sortFilter.value='name-asc';applyFilters();});sideLinks.forEach(link=>link.addEventListener('click',()=>{const type=link.dataset.filterType;const value=link.dataset.filterValue;if(type==='status'){statusFilter.value=value;if(!value){podFilter.value='';industryFilter.value='';search.value='';}}if(type==='inactive')statusFilter.value='inactive';if(type==='pod')podFilter.value=(podFilter.value===value)?'':value;applyFilters();}));statFilters.forEach(stat=>stat.addEventListener('click',()=>{const filter=stat.dataset.statFilter;search.value='';industryFilter.value='';statusFilter.value='active-seo';podFilter.value=filter==='pod'?(stat.dataset.podValue||''):'';applyFilters();}));viewTable.addEventListener('click',()=>{viewTable.classList.add('active');viewCards.classList.remove('active');tableView.style.display='';cardView.style.display='none';});viewCards.addEventListener('click',()=>{viewCards.classList.add('active');viewTable.classList.remove('active');tableView.style.display='none';cardView.style.display='grid';});showAllColumns.addEventListener('change',()=>document.body.classList.toggle('show-all-columns',showAllColumns.checked));showNotes.addEventListener('change',()=>document.body.classList.toggle('show-notes',showNotes.checked));document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement!==search){e.preventDefault();search.focus();}if(e.key==='Escape'&&document.activeElement===search){search.value='';applyFilters();search.blur();}});applyFilters();})();</script></body></html>`;
}
