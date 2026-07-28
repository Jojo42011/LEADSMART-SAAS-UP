# Ascent

Autonomous SEO and AEO platform. Next.js App Router, Tailwind CSS v4, Framer Motion.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Deploys to Vercel with zero configuration. Import the repository and ship.
The daily agent cron in vercel.json activates automatically on Vercel.

## Environment

Everything runs without keys (deterministic research, template drafts).
Add keys to unlock live behavior, see .env.example:

- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: "Continue with Google" sign in.
  Register the callback URL /api/auth/google/callback in Google Cloud.
- GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET: "Continue with GitHub" sign in
  and one click repo publishing (one OAuth App does both). Callback URL:
  /api/connect/github/callback
- AUTH_SECRET: signs the login session cookie, required in production
  (`openssl rand -base64 32`)
- DATABASE_URL: activates multi tenant storage and the autonomous cycle
- STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET: real subscription checkout
  and per tenant activation (webhook endpoint: /api/billing/webhook)
- GEMINI_API_KEY: live competitor research with Google Search grounding and LLM written pages
- CRON_SECRET: protects the daily cron endpoint

WordPress connect needs no configuration: it uses the application password
authorization flow built into WordPress 5.6 and later.

The brand name lives in src/lib/site.ts and can be changed in one place.
