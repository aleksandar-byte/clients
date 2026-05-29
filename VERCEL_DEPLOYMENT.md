# Vercel Deployment

This repo now supports a protected Vercel deployment for `clients-records.html`.

## What Is Protected

- `/clients-records.html` is served by a Next.js route.
- The route checks the Google-authenticated session server-side.
- Only verified Google accounts ending in `@serp.agency` are allowed.
- The generated HTML is returned with `Cache-Control: private, no-store`.

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
AUTH_URL=https://your-vercel-domain.vercel.app
ALLOWED_EMAIL_DOMAIN=serp.agency
```

Generate `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

## Google OAuth Setup

Create or update a Google OAuth client and add these redirect URIs:

```text
https://your-vercel-domain.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

If you later add a custom domain, also add:

```text
https://your-custom-domain.com/api/auth/callback/google
```

## Vercel Setup

1. Import `aleksandar-byte/clients` into Vercel.
2. Let Vercel detect the framework as `Next.js`.
3. Use Node.js `20.x` or newer.
4. Add the environment variables above.
5. Deploy from `main`.

Client records are served by the protected Vercel app from the configured database source. There is no scheduled static rebuild workflow in this repo.

## Important Security Note

This protects the Vercel app only. The current GitHub Pages URL is still public while GitHub Pages remains enabled and this repo remains public. After the Vercel URL is working, disable GitHub Pages or stop publishing `clients-records.html` publicly if Vercel should become the only access path.
