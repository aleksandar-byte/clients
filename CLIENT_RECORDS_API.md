# Client Records API

The client records API is the integration point for other apps. It reads from Neon/Postgres table `core.clients` and returns JSON.

## Base URL

```text
https://clients-records.vercel.app
```

## Authentication

Server-to-server clients should send the shared API token:

```http
Authorization: Bearer <CLIENT_RECORDS_API_TOKEN>
```

Browser users can also access the API after signing in through the shared-password login page.

## Endpoints

List clients:

```http
GET /api/clients
```

Filter clients:

```http
GET /api/clients?status=Active
GET /api/clients?pod=White
GET /api/clients?industry=Dental
GET /api/clients?practice_type=orthodontist
GET /api/clients?service=PPC
GET /api/clients?search=gilman
GET /api/clients?updated_since=2026-05-01
GET /api/clients?limit=25
```

Look up one client by key, slug, client name, or GBP business name:

```http
GET /api/clients/gilman-orthodontics
GET /api/clients/Children%27s%20Dentistry%20of%20Chattanooga
```

Resolve a name or alias:

```http
GET /api/clients/resolve?name=CDOC
GET /api/clients/resolve?name=Gilman
```

## Response Shape

```json
{
  "source": "neon",
  "count": 1,
  "clients": [
    {
      "Client": "Gilman Orthodontics",
      "Website": "https://gilmanorthodontics.com/",
      "Industry": "Dental",
      "Practice Type": "orthodontist",
      "Status": "Active",
      "_client_key": "gilman-orthodontics",
      "_updated_at": "2026-05-29T18:00:00.000Z"
    }
  ],
  "meta": {
    "total": 93
  }
}
```

## Curl Example

```bash
curl "https://clients-records.vercel.app/api/clients?status=Active&pod=White" \
  -H "Authorization: Bearer $CLIENT_RECORDS_API_TOKEN"
```

## JavaScript Example

```js
const response = await fetch("https://clients-records.vercel.app/api/clients/resolve?name=CDOC", {
  headers: {
    authorization: `Bearer ${process.env.CLIENT_RECORDS_API_TOKEN}`
  }
});

if (!response.ok) {
  throw new Error(`Client records API failed: ${response.status}`);
}

const payload = await response.json();
```
