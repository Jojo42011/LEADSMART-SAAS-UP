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

- GEMINI_API_KEY: live competitor research with Google Search grounding and LLM written pages
- GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET: one click GitHub sign in during onboarding
- CRON_SECRET: protects the daily cron endpoint

WordPress connect needs no configuration: it uses the application password
authorization flow built into WordPress 5.6 and later.

The brand name lives in src/lib/site.ts and can be changed in one place.
