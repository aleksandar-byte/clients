import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function slugifyClient(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidApiToken(request) {
  const expected = normalizeText(process.env.CLIENT_RECORDS_API_TOKEN);
  if (!expected) return false;

  const header = request.headers.get("authorization") || "";
  const supplied = header.replace(/^Bearer\s+/i, "").trim();
  if (!supplied) return false;

  return safeEqual(hash(supplied), hash(expected));
}

export function rowSearchText(row) {
  return [
    row.Client,
    row.Website,
    row.Location,
    row.Industry,
    row["Practice Type"],
    row.Pod,
    row.Services,
    row.Status,
    row["Monday Item"],
    row["GBP Business Name"],
    row["GSC Property"],
    row.Notes,
    row._client_key
  ]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
}

export function filterClientRows(rows, searchParams) {
  let filtered = [...rows];

  const status = normalizeText(searchParams.get("status")).toLowerCase();
  const pod = normalizeText(searchParams.get("pod")).toLowerCase();
  const industry = normalizeText(searchParams.get("industry")).toLowerCase();
  const practiceType = normalizeText(searchParams.get("practice_type")).toLowerCase();
  const service = normalizeText(searchParams.get("service")).toLowerCase();
  const search = normalizeText(searchParams.get("search") || searchParams.get("q")).toLowerCase();
  const updatedSince = normalizeText(searchParams.get("updated_since"));
  const limit = Number.parseInt(searchParams.get("limit") || "", 10);

  if (status) {
    filtered = filtered.filter((row) => normalizeText(row.Status).toLowerCase() === status);
  }

  if (pod) {
    filtered = filtered.filter((row) => normalizeText(row.Pod).toLowerCase() === pod);
  }

  if (industry) {
    filtered = filtered.filter((row) => normalizeText(row.Industry).toLowerCase() === industry);
  }

  if (practiceType) {
    filtered = filtered.filter((row) => normalizeText(row["Practice Type"]).toLowerCase() === practiceType);
  }

  if (service) {
    filtered = filtered.filter((row) => normalizeText(row.Services).toLowerCase().includes(service));
  }

  if (search) {
    filtered = filtered.filter((row) => rowSearchText(row).includes(search));
  }

  if (updatedSince) {
    const since = Date.parse(updatedSince);
    if (!Number.isNaN(since)) {
      filtered = filtered.filter((row) => {
        const updatedAt = Date.parse(row._updated_at || "");
        return !Number.isNaN(updatedAt) && updatedAt >= since;
      });
    }
  }

  if (Number.isFinite(limit) && limit > 0) {
    filtered = filtered.slice(0, Math.min(limit, 500));
  }

  return filtered;
}

export function findClientRow(rows, identifier) {
  const target = normalizeText(decodeURIComponent(identifier || ""));
  const targetSlug = slugifyClient(target);
  const targetLower = target.toLowerCase();

  return rows.find((row) => {
    const client = normalizeText(row.Client);
    const gbp = normalizeText(row["GBP Business Name"]);
    return (
      normalizeText(row._client_key) === targetSlug ||
      slugifyClient(client) === targetSlug ||
      slugifyClient(gbp) === targetSlug ||
      client.toLowerCase() === targetLower ||
      gbp.toLowerCase() === targetLower
    );
  });
}

export function resolveClientRows(rows, name) {
  const query = normalizeText(name);
  if (!query) return [];

  const exact = findClientRow(rows, query);
  if (exact) return [exact];

  const queryLower = query.toLowerCase();
  const querySlug = slugifyClient(query);

  return rows
    .map((row) => {
      const haystack = rowSearchText(row);
      const clientSlug = slugifyClient(row.Client);
      const gbpSlug = slugifyClient(row["GBP Business Name"]);
      let score = 0;

      if (clientSlug === querySlug || gbpSlug === querySlug) score += 100;
      if (normalizeText(row.Client).toLowerCase().includes(queryLower)) score += 50;
      if (normalizeText(row["GBP Business Name"]).toLowerCase().includes(queryLower)) score += 35;
      if (haystack.includes(queryLower)) score += 20;
      if (haystack.includes(querySlug.replace(/-/g, " "))) score += 10;

      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.row.Client.localeCompare(right.row.Client))
    .slice(0, 10)
    .map((item) => item.row);
}

export function clientApiResponse({ clients, source = "neon", meta = {} }) {
  return {
    source,
    count: clients.length,
    clients,
    meta
  };
}
