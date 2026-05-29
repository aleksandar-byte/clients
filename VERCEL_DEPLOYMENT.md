# Vercel Deployment

This repo now supports a protected Vercel deployment for `clients-records.html`.

## What Is Protected

- `/clients-records.html` is served by a Next.js route.
- The route checks a secure shared-password session cookie server-side.
- `/api/clients` uses the same cookie, or `CLIENT_RECORDS_API_TOKEN` for scripted access.
- Other apps should use the read-only API documented in `CLIENT_RECORDS_API.md`.
- The generated HTML is returned with `Cache-Control: private, no-store`.

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
CLIENT_RECORDS_PASSWORD=...
CLIENT_RECORDS_SESSION_SECRET=...
CLIENT_RECORDS_API_TOKEN=...
AUTH_URL=https://your-vercel-domain.vercel.app
```

Generate a session secret with:

```bash
openssl rand -base64 32
```

## Password Setup

Add the password to Vercel:

```bash
vercel env add CLIENT_RECORDS_PASSWORD production
vercel env add CLIENT_RECORDS_SESSION_SECRET production
vercel env add CLIENT_RECORDS_API_TOKEN production
```

Use the same values for Preview and Development if those deployments should be testable.

Changing `CLIENT_RECORDS_PASSWORD` revokes existing browser sessions because the cookie signature is derived from the password and session secret.

## Vercel Setup

1. Import `aleksandar-byte/clients` into Vercel.
2. Let Vercel detect the framework as `Next.js`.
3. Use Node.js `20.x` or newer.
4. Add the environment variables above.
5. Deploy from `main`.

Client records are served by the protected Vercel app from the configured database source. There is no scheduled static rebuild workflow in this repo.

## Important Security Note

This protects the Vercel app only. The current GitHub Pages URL is still public while GitHub Pages remains enabled and this repo remains public. After the Vercel URL is working, disable GitHub Pages or stop publishing `clients-records.html` publicly if Vercel should become the only access path.
