#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import os
import urllib.error
import urllib.parse
import urllib.request
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
    "Services",
    "Status",
    "Monday Item",
    "Folder",
    "Sitemap",
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


def status_badge_class(status: str) -> str:
    mapping = {
        "Active": "active",
        "Paused": "paused",
        "Lost / churned": "lost",
        "Needs review": "review",
        "Stopped": "lost",
    }
    return mapping.get(status, "default")


def render_link(label: str, url: str) -> str:
    if not normalize_space(url):
        return ""
    safe_url = html.escape(url, quote=True)
    safe_label = html.escape(label)
    return f'<a href="{safe_url}" target="_blank" rel="noreferrer">{safe_label}</a>'


def summarise(rows: list[dict[str, str]]) -> dict[str, int]:
    active = sum(1 for row in rows if row.get("Status") == "Active")
    paused = sum(1 for row in rows if row.get("Status") == "Paused")
    lost = sum(1 for row in rows if row.get("Status") in {"Lost / churned", "Stopped"})
    white = sum(1 for row in rows if row.get("Pod") == "White")
    orange = sum(1 for row in rows if row.get("Pod") == "Orange")
    return {
        "total": len(rows),
        "active": active,
        "paused": paused,
        "lost": lost,
        "white": white,
        "orange": orange,
    }


def render_html(rows: list[dict[str, str]], base_id: str, table_name: str) -> str:
    summary = summarise(rows)
    row_html: list[str] = []
    for row in rows:
        client_name = row.get("Client", "")
        client = html.escape(client_name)
        website = normalize_space(row.get("Website"))
        location = html.escape(row.get("Location", ""))
        industry = html.escape(row.get("Industry", ""))
        pod_value = row.get("Pod", "")
        pod = html.escape(pod_value)
        start_date = html.escape(row.get("Start Date", ""))
        services = html.escape(row.get("Services", ""))
        status_value = row.get("Status", "")
        status = html.escape(status_value)
        monday_item = html.escape(row.get("Monday Item", ""))
        folder = normalize_space(row.get("Folder"))
        sitemap = normalize_space(row.get("Sitemap"))
        geo = html.escape(row.get("Geo / Target Locations", ""))
        notes = html.escape(row.get("Notes", ""))
        badge_class = status_badge_class(status_value)
        website_html = render_link("website", website)
        folder_html = render_link("folder", folder)
        sitemap_html = render_link("sitemap", sitemap)
        row_html.append(
            f"""
            <tr data-client="{html.escape(client_name.lower())}" data-pod="{html.escape(pod_value.lower())}" data-status="{html.escape(status_value.lower())}">
              <td class="client-cell">
                <div class="client-name">{client}</div>
                <div class="client-links">{website_html} {folder_html} {sitemap_html}</div>
              </td>
              <td>{location}</td>
              <td>{industry}</td>
              <td>{pod}</td>
              <td>{start_date}</td>
              <td>{services}</td>
              <td><span class="badge {badge_class}">{status}</span></td>
              <td>{monday_item}</td>
              <td>{geo}</td>
              <td>{notes}</td>
            </tr>
            """
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Client Records</title>
  <style>
    :root {{
      --bg: #f6f3eb;
      --card: #fffdf7;
      --ink: #1f2a2a;
      --muted: #5d6a67;
      --line: #d8d1c2;
      --accent: #0e7a6d;
      --active: #d7f4ea;
      --paused: #fff0bf;
      --lost: #ffd7d2;
      --review: #dbe7ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Georgia, "Aptos", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14,122,109,.12), transparent 30%),
        radial-gradient(circle at top right, rgba(212,166,92,.12), transparent 28%),
        var(--bg);
    }}
    .wrap {{
      max-width: 1500px;
      margin: 0 auto;
      padding: 32px 20px 56px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 1;
    }}
    .sub {{
      color: var(--muted);
      max-width: 980px;
      margin-bottom: 22px;
    }}
    .stats {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }}
    .stat {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: 0 10px 30px rgba(31,42,42,.05);
    }}
    .stat-label {{
      font-size: .84rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .06em;
    }}
    .stat-value {{
      font-size: 1.7rem;
      margin-top: 4px;
    }}
    .toolbar {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 16px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
    }}
    .toolbar input, .toolbar select {{
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: white;
      color: var(--ink);
      min-width: 180px;
    }}
    .table-shell {{
      overflow: auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 14px 36px rgba(31,42,42,.06);
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 1300px;
    }}
    th, td {{
      padding: 14px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      font-size: .95rem;
    }}
    th {{
      position: sticky;
      top: 0;
      z-index: 1;
      background: #fbf8ef;
      font-size: .8rem;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    tr:last-child td {{
      border-bottom: 0;
    }}
    .client-cell {{
      min-width: 260px;
    }}
    .client-name {{
      font-weight: 700;
      margin-bottom: 5px;
    }}
    .client-links {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      font-size: .85rem;
    }}
    .client-links a {{
      color: var(--accent);
      text-decoration: none;
    }}
    .badge {{
      display: inline-block;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: .82rem;
      font-weight: 700;
      white-space: nowrap;
    }}
    .badge.active {{ background: var(--active); }}
    .badge.paused {{ background: var(--paused); }}
    .badge.lost {{ background: var(--lost); }}
    .badge.review {{ background: var(--review); }}
    .badge.default {{ background: #ece7dc; }}
    .footer {{
      margin-top: 14px;
      color: var(--muted);
      font-size: .9rem;
    }}
    .hidden-row {{ display: none; }}
    @media (max-width: 900px) {{
      .wrap {{ padding: 24px 14px 40px; }}
      .toolbar {{ flex-direction: column; align-items: stretch; }}
      .toolbar input, .toolbar select {{ width: 100%; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Client Records</h1>
    <div class="sub">Generated from the Airtable <code>{html.escape(table_name)}</code> table in base <code>{html.escape(base_id)}</code>. Update Airtable and the page will republish on the next scheduled run.</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Total Clients</div><div class="stat-value">{summary["total"]}</div></div>
      <div class="stat"><div class="stat-label">Active</div><div class="stat-value">{summary["active"]}</div></div>
      <div class="stat"><div class="stat-label">Paused</div><div class="stat-value">{summary["paused"]}</div></div>
      <div class="stat"><div class="stat-label">Lost / Churned</div><div class="stat-value">{summary["lost"]}</div></div>
      <div class="stat"><div class="stat-label">White Pod</div><div class="stat-value">{summary["white"]}</div></div>
      <div class="stat"><div class="stat-label">Orange Pod</div><div class="stat-value">{summary["orange"]}</div></div>
    </div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search client, location, notes..." />
      <select id="pod">
        <option value="">All pods</option>
        <option value="white">White</option>
        <option value="orange">Orange</option>
      </select>
      <select id="status">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="lost / churned">Lost / churned</option>
        <option value="needs review">Needs review</option>
        <option value="stopped">Stopped</option>
      </select>
    </div>
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Location</th>
            <th>Industry</th>
            <th>Pod</th>
            <th>Start Date</th>
            <th>Services</th>
            <th>Status</th>
            <th>Monday Item</th>
            <th>Geo / Target Locations</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody id="records-body">
          {''.join(row_html)}
        </tbody>
      </table>
    </div>
    <div class="footer">Live URL: <a href="{LIVE_URL}">{LIVE_URL}</a></div>
  </div>
  <script>
    const search = document.getElementById('search');
    const pod = document.getElementById('pod');
    const status = document.getElementById('status');
    const rows = [...document.querySelectorAll('#records-body tr')];

    function applyFilters() {{
      const query = search.value.trim().toLowerCase();
      const podValue = pod.value;
      const statusValue = status.value;

      for (const row of rows) {{
        const text = row.textContent.toLowerCase();
        const matchesQuery = !query || text.includes(query);
        const matchesPod = !podValue || row.dataset.pod === podValue;
        const matchesStatus = !statusValue || row.dataset.status === statusValue;
        row.classList.toggle('hidden-row', !(matchesQuery && matchesPod && matchesStatus));
      }}
    }}

    search.addEventListener('input', applyFilters);
    pod.addEventListener('change', applyFilters);
    status.addEventListener('change', applyFilters);
  </script>
</body>
</html>
"""


def main() -> int:
    token = require_env("AIRTABLE_TOKEN")
    base_id = require_env("AIRTABLE_BASE_ID")
    table_name = os.environ.get("AIRTABLE_TABLE_NAME", "Clients")
    rows = list_records(token, base_id, table_name)
    OUTPUT_PATH.write_text(render_html(rows, base_id, table_name), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT_PATH), "row_count": len(rows)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
