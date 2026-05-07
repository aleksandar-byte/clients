#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


API_BASE = "https://api.airtable.com/v0"
PAGE_SIZE = 100
OUTPUT_PATH = Path("clients-records.html")
LIVE_URL = "https://aleksandar-byte.github.io/clients/clients-records.html"
FIELD_ORDER = [
    "Client",
    "Website",
    "Location",
    "Industry",
    "Pod",
    "Start Date",
    "Launch Date",
    "Services",
    "Status",
    "Monday Item",
    "GA4 Property ID",
    "GSC Property",
    "GBP Link",
    "Folder",
    "Sitemap",
    "Geo Targets Done",
    "Geo Targets Planned",
    "Geo / Target Locations",
    "Notes",
]


def normalize_space(value: str | None) -> str:
    return " ".join((value or "").replace("\n", " ").split())


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def airtable_request(token: str, method: str, path: str, *, query: dict[str, object] | None = None) -> dict:
    url = API_BASE + path
    if query:
        url = f"{url}?{urllib.parse.urlencode(query, doseq=True)}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Airtable HTTP error {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Airtable request failed: {exc.reason}") from exc
    return json.loads(raw) if raw else {}


def list_records(token: str, base_id: str, table_name: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    offset: str | None = None
    while True:
        query: dict[str, object] = {"pageSize": PAGE_SIZE, "fields[]": FIELD_ORDER}
        if offset:
            query["offset"] = offset
        page = airtable_request(
            token,
            "GET",
            f"/{base_id}/{urllib.parse.quote(table_name, safe='')}",
            query=query,
        )
        for record in page.get("records") or []:
            fields = record.get("fields") or {}
            row = {field: normalize_space(fields.get(field)) for field in FIELD_ORDER}
            if row["Client"]:
                records.append(row)
        offset = page.get("offset")
        if not offset:
            break
    records.sort(key=lambda row: row["Client"].lower())
    return records


def status_key(status: str) -> str:
    value = normalize_space(status).casefold()
    if value == "active":
        return "active"
    if value == "paused":
        return "paused"
    if value in {"lost / churned", "stopped", "lost"}:
        return "lost"
    if value == "needs review":
        return "review"
    return "unknown"


def status_label(status: str) -> str:
    return normalize_space(status) or "Unmarked"


def pct(part: int, total: int) -> int:
    return round((part / total) * 100) if total else 0


def dash(value: str | None) -> str:
    return html.escape(normalize_space(value) or "-")


def render_link(label: str, url: str) -> str:
    if not normalize_space(url):
        return ""
    safe_url = html.escape(url, quote=True)
    safe_label = html.escape(label)
    return f'<a href="{safe_url}" target="_blank" rel="noreferrer" class="lnk">{safe_label}</a>'


def render_links(row: dict[str, str]) -> str:
    links = [
        render_link("www", row.get("Website", "")),
        render_link("GBP", row.get("GBP Link", "")),
        render_link("drive", row.get("Folder", "")),
        render_link("map", row.get("Sitemap", "")),
    ]
    return "".join(link for link in links if link) or '<span class="muted">no links</span>'


def split_chips(value: str) -> list[str]:
    parts = [item.strip() for item in normalize_space(value).split(",") if item.strip()]
    chips: list[str] = []
    index = 0
    while index < len(parts):
        current = parts[index]
        if index + 1 < len(parts):
            maybe_state = parts[index + 1]
            if 2 <= len(maybe_state) <= 3 and maybe_state.isupper():
                chips.append(f"{current}, {maybe_state}")
                index += 2
                continue
        chips.append(current)
        index += 1
    return chips


def render_geo_chips(done: str, planned: str) -> str:
    chips = [
        f'<span class="geo-chip geo-done">{html.escape(item)}</span>'
        for item in split_chips(done)
    ]
    chips.extend(
        f'<span class="geo-chip geo-planned">{html.escape(item)}</span>'
        for item in split_chips(planned)
    )
    return "".join(chips) or '<span class="muted">no geo targets</span>'


def service_tokens(row: dict[str, str]) -> set[str]:
    text = normalize_space(row.get("Services")).casefold()
    return {item.strip() for item in re.split(r"[,/]+", text) if item.strip()}


def has_seo_service(row: dict[str, str]) -> bool:
    return any(token == "seo" or token.startswith("seo ") for token in service_tokens(row))


def is_hosting_only(row: dict[str, str]) -> bool:
    services = normalize_space(row.get("Services")).casefold()
    return "hosting" in services and not has_seo_service(row)


def effective_status_key(row: dict[str, str]) -> str:
    raw_status = status_key(row.get("Status", ""))
    if raw_status == "active" and is_hosting_only(row):
        return "paused"
    return raw_status


def effective_status_label(row: dict[str, str]) -> str:
    raw_status = status_key(row.get("Status", ""))
    if raw_status == "active" and is_hosting_only(row):
        return "Paused"
    return status_label(row.get("Status", ""))


def is_active_seo(row: dict[str, str]) -> bool:
    return effective_status_key(row) == "active" and has_seo_service(row)


def summarise(rows: list[dict[str, str]]) -> dict[str, int]:
    total = len(rows)
    active = sum(1 for row in rows if effective_status_key(row) == "active")
    active_seo = sum(1 for row in rows if is_active_seo(row))
    paused = sum(1 for row in rows if effective_status_key(row) == "paused")
    lost = sum(1 for row in rows if effective_status_key(row) == "lost")
    review = sum(1 for row in rows if effective_status_key(row) == "review")
    white = sum(1 for row in rows if normalize_space(row.get("Pod")) == "White" and is_active_seo(row))
    orange = sum(1 for row in rows if normalize_space(row.get("Pod")) == "Orange" and is_active_seo(row))
    return {
        "total": total,
        "active": active,
        "active_seo": active_seo,
        "paused": paused,
        "lost": lost,
        "inactive": paused + lost,
        "review": review,
        "white": white,
        "orange": orange,
        "active_pct": pct(active, total),
        "active_seo_pct": pct(active_seo, total),
        "paused_pct": pct(paused, total),
        "lost_pct": pct(lost, total),
        "white_pct": pct(white, active_seo),
        "orange_pct": pct(orange, active_seo),
    }


def render_html(rows: list[dict[str, str]], base_id: str, table_name: str) -> str:
    summary = summarise(rows)
    issued = datetime.now().strftime("%d %b %Y")
    source_description = (
        f'Generated from Airtable table <code>{html.escape(table_name)}</code> '
        f'in base <code>{html.escape(base_id)}</code>.'
    )
    industries = sorted({normalize_space(row.get("Industry")) for row in rows if normalize_space(row.get("Industry"))})
    industry_options = "\n".join(
        f'          <option value="{html.escape(industry.lower(), quote=True)}">{html.escape(industry)}</option>'
        for industry in industries
    )
    row_html: list[str] = []
    card_html: list[str] = []
    for index, row in enumerate(rows, start=1):
        client_name = normalize_space(row.get("Client"))
        status = effective_status_label(row)
        status_class = effective_status_key(row)
        active_seo = "true" if is_active_seo(row) else "false"
        pod_value = normalize_space(row.get("Pod"))
        industry = normalize_space(row.get("Industry"))
        location = normalize_space(row.get("Location"))
        services = normalize_space(row.get("Services"))
        start_date = normalize_space(row.get("Start Date"))
        launch_date = normalize_space(row.get("Launch Date"))
        geo_done = normalize_space(row.get("Geo Targets Done"))
        geo_planned = normalize_space(row.get("Geo Targets Planned"))
        geo = " ".join([geo_done, geo_planned])
        notes = normalize_space(row.get("Notes"))
        monday_item = normalize_space(row.get("Monday Item"))
        ga4_property_id = normalize_space(row.get("GA4 Property ID"))
        gsc_property = normalize_space(row.get("GSC Property"))
        gbp_link = normalize_space(row.get("GBP Link"))
        links = render_links(row)
        data_search = html.escape(
            " ".join([client_name, location, industry, pod_value, services, status, geo, notes, gbp_link]).lower(),
            quote=True,
        )
        data_pod = html.escape(pod_value.lower(), quote=True)
        data_industry = html.escape(industry.lower(), quote=True)
        entry_no = f"{index:03d}"
        row_html.append(
            f"""
              <tr class="row" data-status="{status_class}" data-active-seo="{active_seo}" data-pod="{data_pod}" data-industry="{data_industry}" data-search="{data_search}">
                <td class="cell-client"><span class="entry-num">No. {entry_no}</span><strong>{html.escape(client_name)}</strong><div class="client-links">{links}</div></td>
                <td>{dash(location)}</td>
                <td>{dash(industry)}</td>
                <td><span class="pod pod-{html.escape(pod_value.lower() or 'none')}">{dash(pod_value)}</span></td>
                <td class="mono">{dash(start_date)}</td>
                <td class="mono">{dash(launch_date)}</td>
                <td>{dash(services)}</td>
                <td><span class="badge badge-{status_class}"><span class="dot"></span>{html.escape(status)}</span></td>
                <td class="api-key-col mono">{dash(monday_item)}</td>
                <td class="api-key-col mono">{dash(ga4_property_id)}</td>
                <td class="api-key-col mono">{dash(gsc_property)}</td>
                <td class="geo-cell wide">{render_geo_chips(geo_done, geo_planned)}</td>
                <td class="notes-col wide">{dash(notes)}</td>
              </tr>
            """
        )
        card_html.append(
            f"""
              <article class="card-item" data-status="{status_class}" data-active-seo="{active_seo}" data-pod="{data_pod}" data-industry="{data_industry}" data-search="{data_search}">
                <div class="card-corner"><span class="entry-num">No. {entry_no}</span><span class="badge badge-{status_class}"><span class="dot"></span>{html.escape(status)}</span></div>
                <h3>{html.escape(client_name)}</h3>
                <div class="card-meta">{dash(location)} <span>/</span> {dash(industry)} <span>/</span> {dash(pod_value)}</div>
                <dl class="card-grid">
                  <div><dt>Started</dt><dd class="mono">{dash(start_date)}</dd></div>
                  <div><dt>Launched</dt><dd class="mono">{dash(launch_date)}</dd></div>
                  <div><dt>Services</dt><dd>{dash(services)}</dd></div>
                  <div class="api-key-col"><dt>Monday</dt><dd class="mono">{dash(monday_item)}</dd></div>
                  <div class="api-key-col"><dt>GA4</dt><dd class="mono">{dash(ga4_property_id)}</dd></div>
                  <div class="api-key-col span-2"><dt>GSC</dt><dd class="mono truncate">{dash(gsc_property)}</dd></div>
                  <div class="span-2"><dt>Geo targets</dt><dd class="geo-cell">{render_geo_chips(geo_done, geo_planned)}</dd></div>
                  <div class="notes-col span-2"><dt>Notes</dt><dd class="truncate">{dash(notes)}</dd></div>
                </dl>
                <footer>{links}</footer>
              </article>
            """
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Client Records - The Roster</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {{ --paper:#f1ece0; --paper-soft:#f7f3e9; --surface:#fdfaf2; --ink:#15140e; --muted:#8a8473; --line:#d8d0bc; --line-2:#c8bfa7; --accent:#c14a1d; --forest:#2d4a37; --blue:#1f3a5f; --amber:#a06814; --crimson:#952820; --shadow:0 24px 56px -24px rgba(21,20,14,.34); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--ink); font:14px/1.45 "IBM Plex Sans", system-ui, sans-serif; background:var(--paper); background-image:radial-gradient(circle at 18% 20%, rgba(193,74,29,.045), transparent 40%), radial-gradient(circle at 90% 110%, rgba(45,74,55,.05), transparent 45%); }} a {{ color:inherit; }}
    .app {{ display:grid; grid-template-columns:240px minmax(0, 1fr); min-height:100vh; }} .sidebar {{ position:sticky; top:0; height:100vh; overflow:auto; background:var(--ink); color:#c8c4b6; padding:28px 20px; display:flex; flex-direction:column; gap:26px; }}
    .brand {{ font:500 22px/1 "Fraunces", serif; color:var(--paper); letter-spacing:-.02em; }} .brand span {{ color:var(--accent); font-style:italic; }} .brand-sub, .side-section h4, .side-foot, .topbar-meta, .mono, .entry-num, .toolbar-label, .meta-tag {{ font-family:"IBM Plex Mono", monospace; }}
    .brand-sub {{ margin-top:6px; font-size:9.5px; letter-spacing:.18em; text-transform:uppercase; color:#6e6856; }} .side-section h4 {{ margin:0 0 10px; padding-left:10px; font-size:9.5px; font-weight:500; letter-spacing:.18em; text-transform:uppercase; color:#6e6856; }}
    .side-link {{ display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-radius:5px; cursor:pointer; color:#c8c4b6; }} .side-link:hover, .side-link.active {{ background:#1f1d14; color:var(--paper); }} .side-link .count {{ font-family:"IBM Plex Mono", monospace; font-size:11px; color:#8a8473; }} .side-link.active .count {{ color:var(--accent); }}
    .pod-tag {{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:9px; vertical-align:middle; }} .pod-white-bg {{ background:#93b5e1; }} .pod-orange-bg {{ background:#e08a5c; }} .side-foot {{ margin-top:auto; padding-top:14px; border-top:1px solid #2a281e; color:#6e6856; font-size:10.5px; line-height:1.7; }} .side-foot .meta {{ color:#c8c4b6; }}
    .main {{ min-width:0; }} .topbar {{ position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:14px; padding:12px 36px; background:rgba(241,236,224,.94); border-bottom:1px solid var(--line); backdrop-filter:saturate(140%); }} .search {{ flex:1; max-width:480px; position:relative; }} .search input {{ width:100%; padding:9px 42px 9px 14px; border:1px solid var(--line); border-radius:4px; background:var(--surface); font:inherit; outline:none; }} .kbd {{ position:absolute; right:10px; top:50%; transform:translateY(-50%); border:1px solid var(--line); padding:1px 6px; border-radius:3px; color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10.5px; }} .topbar-spacer {{ flex:1; }} .topbar-meta {{ font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }}
    .view-toggle {{ display:flex; border:1px solid var(--line); border-radius:4px; overflow:hidden; }} .view-toggle button {{ border:0; border-right:1px solid var(--line); background:var(--surface); padding:8px 12px; cursor:pointer; font-family:"IBM Plex Mono", monospace; font-size:11px; letter-spacing:.06em; color:var(--muted); }} .view-toggle button:last-child {{ border-right:0; }} .view-toggle button.active {{ background:var(--ink); color:var(--paper); }}
    .masthead {{ padding:42px 36px 26px; border-bottom:1px solid var(--line); }} .spec-strip {{ display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; }} .title-grid {{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:36px; margin-top:24px; align-items:end; }} h1 {{ margin:0; font:500 clamp(42px, 8vw, 104px)/.9 "Fraunces", serif; letter-spacing:-.055em; }} h1 em {{ color:var(--accent); font-style:italic; }} .title-deck {{ color:#5a564b; font-size:18px; max-width:360px; }} .lede {{ max-width:880px; color:#5a564b; margin:24px 0 0; }}
    .stats {{ display:grid; grid-template-columns:1.35fr repeat(2, 1fr); gap:12px; margin-top:28px; }} .stat {{ background:var(--surface); border:1px solid var(--line); padding:16px; box-shadow:var(--shadow); min-height:124px; }} .stat-click {{ cursor:pointer; text-align:left; color:inherit; font:inherit; }} .stat-click:hover {{ border-color:var(--accent); transform:translateY(-1px); }} .stat-label {{ color:var(--muted); text-transform:uppercase; font-family:"IBM Plex Mono", monospace; font-size:10px; letter-spacing:.14em; }} .stat-value {{ font:600 42px/1 "Fraunces", serif; margin-top:12px; }} .stat-trend {{ color:#5a564b; font-size:12px; margin-top:8px; }} .stat-bar {{ height:4px; background:var(--line); margin-top:14px; }} .stat-bar span {{ display:block; height:100%; }}
    .workspace {{ padding:28px 36px 48px; }} .section-head {{ display:flex; align-items:center; gap:16px; margin-bottom:16px; }} .section-head h2 {{ font:500 28px/1 "Fraunces", serif; margin:0; }} .section-head h2 em {{ color:var(--accent); }} .rule {{ flex:1; height:1px; background:var(--line); }} .meta-tag {{ color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.12em; }} .toolbar {{ display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px; }} .toolbar select, .chip, .toggle-field {{ border:1px solid var(--line); background:var(--surface); border-radius:4px; padding:8px 10px; font:inherit; color:var(--ink); }} .toolbar-label, .results-count {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.1em; }} .chip, .toggle-field {{ display:inline-flex; align-items:center; gap:8px; cursor:pointer; }} .toggle-field input {{ margin:0; }} .results-count {{ margin-left:auto; }}
    .table-shell {{ background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); }} .table-scroll {{ overflow:auto; max-height:78vh; }} table {{ width:100%; min-width:1380px; border-collapse:separate; border-spacing:0; }} th {{ position:sticky; top:0; z-index:2; background:#eee7d8; color:#5a564b; font:600 10px "IBM Plex Mono", monospace; letter-spacing:.12em; text-transform:uppercase; text-align:left; padding:12px; border-bottom:1px solid var(--line-2); }} td {{ padding:13px 12px; border-bottom:1px solid var(--line); vertical-align:top; }} tbody tr:hover {{ background:#faf5e8; }}
    .cell-client {{ min-width:270px; }} .cell-client strong {{ display:block; margin:4px 0 8px; }} .entry-num {{ color:var(--muted); font-size:10px; letter-spacing:.1em; text-transform:uppercase; }} .client-links, .card-item footer {{ display:flex; flex-wrap:wrap; gap:7px; }} .lnk {{ text-decoration:none; border:1px solid var(--line); padding:3px 7px; border-radius:999px; color:var(--accent); font-size:11px; background:#fffaf0; }} .badge {{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px; white-space:nowrap; }} .badge .dot {{ width:6px; height:6px; border-radius:50%; background:currentColor; }} .badge-active {{ color:var(--forest); background:#cfddc7; }} .badge-paused {{ color:var(--amber); background:#f0d99c; }} .badge-lost {{ color:var(--crimson); background:#f0c9c2; }} .badge-review {{ color:var(--blue); background:#cdd8e3; }} .badge-unknown {{ color:#5a564b; background:#e8dfcc; }} .pod {{ font-weight:700; }} .pod-white {{ color:var(--blue); }} .pod-orange {{ color:var(--accent); }} .wide {{ min-width:240px; }} .muted {{ color:var(--muted); }} .truncate {{ overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }} .geo-cell {{ display:flex; flex-wrap:wrap; gap:6px; max-width:360px; }} .geo-chip {{ display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; line-height:1.2; }} .geo-done {{ color:var(--forest); background:#cfddc7; border-color:#adc29f; }} .geo-planned {{ color:var(--accent); background:#f3d9c6; border-color:#e3b596; }} .api-key-col, .notes-col {{ display:none; }} body.show-api-keys .api-key-col, body.show-notes .notes-col {{ display:table-cell; }} body.show-api-keys .card-item .api-key-col, body.show-notes .card-item .notes-col {{ display:block; }}
    .cards {{ display:none; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }} .cards.show {{ display:grid; }} .table-shell.hide {{ display:none; }} .card-item {{ background:var(--surface); border:1px solid var(--line); padding:16px; box-shadow:var(--shadow); }} .card-corner {{ display:flex; justify-content:space-between; align-items:center; gap:12px; }} .card-item h3 {{ margin:14px 0 6px; font:600 25px/1.05 "Fraunces", serif; }} .card-meta {{ color:#5a564b; font-size:12px; }} .card-meta span {{ color:var(--muted); margin:0 5px; }} .card-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; }} .card-grid div {{ min-width:0; }} .card-grid dt {{ color:var(--muted); font-family:"IBM Plex Mono", monospace; font-size:10px; text-transform:uppercase; letter-spacing:.1em; }} .card-grid dd {{ margin:3px 0 0; }} .span-2 {{ grid-column:1 / -1; }} .empty {{ display:none; text-align:center; padding:50px; color:var(--muted); border:1px dashed var(--line-2); background:var(--surface); }} .empty.show {{ display:block; }} .hidden {{ display:none !important; }}
    @media (max-width:960px) {{ .app {{ display:block; }} .sidebar {{ position:relative; height:auto; }} .topbar {{ padding:12px 16px; flex-wrap:wrap; }} .topbar-meta, .kbd {{ display:none; }} .masthead, .workspace {{ padding-left:16px; padding-right:16px; }} .title-grid, .stats {{ grid-template-columns:1fr; }} h1 {{ font-size:52px; }} }}
  </style>
</head>
<body><div class="app"><aside class="sidebar"><div><div class="brand">Roster<span>&amp;</span>Co.</div><div class="brand-sub">Client Records</div></div><div class="side-section"><h4>By Status</h4><div class="side-link" data-filter-type="status" data-filter-value=""><span>All clients</span><span class="count">{summary["total"]:03d}</span></div><div class="side-link active" data-filter-type="status" data-filter-value="active-seo"><span>Active SEO</span><span class="count">{summary["active_seo"]:03d}</span></div><div class="side-link" data-filter-type="status" data-filter-value="active"><span>Active all</span><span class="count">{summary["active"]:03d}</span></div><div class="side-link" data-filter-type="inactive" data-filter-value="true"><span>Paused / inactive</span><span class="count">{summary["inactive"]:03d}</span></div><div class="side-link" data-filter-type="status" data-filter-value="review"><span>Needs review</span><span class="count">{summary["review"]:03d}</span></div></div><div class="side-section"><h4>By Pod</h4><div class="side-link" data-filter-type="pod" data-filter-value="white"><span><span class="pod-tag pod-white-bg"></span>White Pod</span><span class="count">{summary["white"]:03d}</span></div><div class="side-link" data-filter-type="pod" data-filter-value="orange"><span><span class="pod-tag pod-orange-bg"></span>Orange Pod</span><span class="count">{summary["orange"]:03d}</span></div></div><div class="side-foot"><div><span class="meta">Source</span></div><div>Airtable / Clients</div><br><div><span class="meta">Rendered</span></div><div>{html.escape(issued)}</div></div></aside><main class="main"><div class="topbar"><div class="search"><input id="search" type="search" placeholder="Search clients, locations, geo, notes..." autocomplete="off"><span class="kbd">/</span></div><div class="topbar-spacer"></div><div class="topbar-meta">Active SEO / <strong>{summary["active_seo"]} entries</strong></div><div class="view-toggle"><button id="view-table" class="active" type="button">Table</button><button id="view-cards" type="button">Cards</button></div></div><header class="masthead"><div class="spec-strip"><span>Issued <strong>{html.escape(issued)}</strong></span><span>/</span><span>Active SEO roster</span></div><div class="title-grid"><h1>The Roster, <em>annotated</em>.</h1><div class="title-deck">A cleaner field guide to every client: sorted, searchable, linked, and easier to review.</div></div><p class="lede">{source_description} Update upstream first; this view rebuilds from the records pipeline. API identifiers are hidden unless you turn them on.</p><div class="stats"><button class="stat stat-click" type="button" data-stat-filter="active-seo"><div class="stat-label">Active SEO</div><div class="stat-value">{summary["active_seo"]}</div><div class="stat-trend">Default working roster</div><div class="stat-bar"><span style="width:{summary["active_seo_pct"]}%;background:var(--forest)"></span></div></button><button class="stat stat-click" type="button" data-stat-filter="pod" data-pod-value="white"><div class="stat-label">White Pod SEO</div><div class="stat-value">{summary["white"]}</div><div class="stat-trend">{summary["white_pct"]}% of active SEO</div><div class="stat-bar"><span style="width:{summary["white_pct"]}%;background:var(--blue)"></span></div></button><button class="stat stat-click" type="button" data-stat-filter="pod" data-pod-value="orange"><div class="stat-label">Orange Pod SEO</div><div class="stat-value">{summary["orange"]}</div><div class="stat-trend">{summary["orange_pct"]}% of active SEO</div><div class="stat-bar"><span style="width:{summary["orange_pct"]}%;background:var(--accent)"></span></div></button></div></header><section class="workspace"><div class="section-head"><h2>The <em>full</em> ledger</h2><div class="rule"></div><div class="meta-tag">{summary["total"]} entries / sorted A-Z</div></div><div class="toolbar"><span class="toolbar-label">Filter -></span><select id="industry-filter"><option value="">All industries</option>
{industry_options}
        </select><select id="pod-filter"><option value="">All pods</option><option value="white">White pod</option><option value="orange">Orange pod</option></select><select id="status-filter"><option value="">All statuses</option><option value="active-seo" selected>Active SEO</option><option value="active">Active all</option><option value="inactive">Paused / inactive</option><option value="review">Needs review</option></select><label class="toggle-field"><input id="show-api-keys" type="checkbox"> Show API keys</label><label class="toggle-field"><input id="show-notes" type="checkbox"> Show notes</label><button class="chip" id="reset-btn" type="button" style="display:none;">Clear x</button><div class="results-count" id="results-count">Showing <strong>{summary["active_seo"]}</strong> of {summary["total"]}</div></div><div class="table-shell" id="table-view"><div class="table-scroll"><table><thead><tr><th>Client</th><th>Location</th><th>Industry</th><th>Pod</th><th>Started</th><th>Launched</th><th>Services</th><th>Status</th><th class="api-key-col">Monday</th><th class="api-key-col">GA4</th><th class="api-key-col">GSC</th><th>Geo targets</th><th class="notes-col">Notes</th></tr></thead><tbody id="rows">
{''.join(row_html)}
      </tbody></table></div></div><div class="cards" id="card-view">
{''.join(card_html)}
      </div><div class="empty" id="empty-state"><h3>Nothing in the ledger.</h3><p>Clear filters or search again.</p></div></section></main></div><script>(function(){{const search=document.getElementById('search');const podFilter=document.getElementById('pod-filter');const statusFilter=document.getElementById('status-filter');const industryFilter=document.getElementById('industry-filter');const resetBtn=document.getElementById('reset-btn');const empty=document.getElementById('empty-state');const tableView=document.getElementById('table-view');const cardView=document.getElementById('card-view');const sideLinks=document.querySelectorAll('.side-link');const viewTable=document.getElementById('view-table');const viewCards=document.getElementById('view-cards');const showApiKeys=document.getElementById('show-api-keys');const showNotes=document.getElementById('show-notes');const statFilters=document.querySelectorAll('[data-stat-filter]');const total={summary["total"]};function applyFilters(){{const q=(search.value||'').trim().toLowerCase();const pod=podFilter.value;const status=statusFilter.value;const industry=industryFilter.value;const items=[...document.querySelectorAll('#rows .row'),...document.querySelectorAll('#card-view .card-item')];let visible=0;items.forEach(el=>{{const matchesStatus=!status||el.dataset.status===status||(status==='active-seo'&&el.dataset.activeSeo==='true')||(status==='inactive'&&['paused','lost'].includes(el.dataset.status));const show=(!q||el.dataset.search.includes(q))&&(!pod||el.dataset.pod===pod)&&matchesStatus&&(!industry||el.dataset.industry===industry);el.classList.toggle('hidden',!show);if(show&&el.classList.contains('row'))visible++;}});document.getElementById('results-count').innerHTML='Showing <strong>'+visible+'</strong> of '+total;resetBtn.style.display=(q||pod||status||industry)?'inline-flex':'none';empty.classList.toggle('show',visible===0);tableView.style.display=visible===0?'none':(viewTable.classList.contains('active')?'':'none');cardView.style.display=visible===0?'none':(viewCards.classList.contains('active')?'grid':'none');sideLinks.forEach(link=>{{const type=link.dataset.filterType;const value=link.dataset.filterValue;link.classList.toggle('active',(type==='status'&&value===status)||(type==='inactive'&&status==='inactive')||(type==='pod'&&value===pod)||(!value&&!status&&!pod&&type==='status'));}});}}search.addEventListener('input',applyFilters);podFilter.addEventListener('change',applyFilters);statusFilter.addEventListener('change',applyFilters);industryFilter.addEventListener('change',applyFilters);resetBtn.addEventListener('click',()=>{{search.value='';podFilter.value='';statusFilter.value='';industryFilter.value='';applyFilters();}});sideLinks.forEach(link=>link.addEventListener('click',()=>{{const type=link.dataset.filterType;const value=link.dataset.filterValue;if(type==='status'){{statusFilter.value=value;if(!value){{podFilter.value='';industryFilter.value='';search.value='';}}}}if(type==='inactive')statusFilter.value='inactive';if(type==='pod')podFilter.value=(podFilter.value===value)?'':value;applyFilters();}}));statFilters.forEach(stat=>stat.addEventListener('click',()=>{{const filter=stat.dataset.statFilter;search.value='';industryFilter.value='';statusFilter.value='active-seo';podFilter.value=filter==='pod'?(stat.dataset.podValue||''):'';applyFilters();}}));viewTable.addEventListener('click',()=>{{viewTable.classList.add('active');viewCards.classList.remove('active');tableView.style.display='';cardView.style.display='none';}});viewCards.addEventListener('click',()=>{{viewCards.classList.add('active');viewTable.classList.remove('active');tableView.style.display='none';cardView.style.display='grid';}});showApiKeys.addEventListener('change',()=>document.body.classList.toggle('show-api-keys',showApiKeys.checked));showNotes.addEventListener('change',()=>document.body.classList.toggle('show-notes',showNotes.checked));document.addEventListener('keydown',e=>{{if(e.key==='/'&&document.activeElement!==search){{e.preventDefault();search.focus();}}if(e.key==='Escape'&&document.activeElement===search){{search.value='';applyFilters();search.blur();}}}});applyFilters();}})();</script></body></html>"""


def clean_generated_html(html_text: str) -> str:
    return "\n".join(line.rstrip() for line in html_text.splitlines()) + "\n"


def main() -> int:
    token = require_env("AIRTABLE_TOKEN")
    base_id = require_env("AIRTABLE_BASE_ID")
    table_name = os.environ.get("AIRTABLE_TABLE_NAME", "Clients")
    rows = list_records(token, base_id, table_name)
    OUTPUT_PATH.write_text(clean_generated_html(render_html(rows, base_id, table_name)), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "row_count": len(rows)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
