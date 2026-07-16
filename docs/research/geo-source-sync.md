# GEO Source Sync

Tracks our sync state against the upstream research source for Generative Engine
Optimization (GEO) tactics, so we can pick up new tactics/tools as the list updates.

**Source repo:** https://github.com/amplifying-ai/awesome-generative-engine-optimization
**Last synced commit:** `7c37369` (2026-04-14 — "Merge pull request #17 from HaritzPuerto/main")
**Last synced:** 2026-07-16

## How the sync works

A weekly Routine re-clones the repo, diffs its HEAD against the commit above, and if
changed:
1. Reads the new/changed content (readme.md, papers-and-studies/, presentations/).
2. Extracts anything actionable for Ascent's agent behavior, audit scoring, or
   dashboard (new GEO tactics, new citation-platform data, new tooling patterns,
   new protocol adoption signals like llms.txt).
3. Updates this file's "Last synced commit" and appends a dated entry to the log
   below describing what changed and what was implemented (or why nothing was).
4. Commits and pushes to `Row-Claude/leadsmart-seo`.

See the Routine named "GEO source weekly sync" (or search triggers for
"awesome-generative-engine-optimization") for the schedule.

## What was extracted at the initial sync (2026-07-16)

From the repo's readme.md, condensed to what's implementable in Ascent today:

### The 9 core GEO tactics (Princeton/Georgia Tech/Allen Institute, arXiv:2311.09735)
Showed measurable (up to 40%) visibility improvements in LLM-generated answers:
1. **Cite Sources** — reference authoritative external sources within the content.
2. **Quotation Addition** — include direct quotes (expert, customer, primary source).
3. **Statistics Addition** — include concrete numbers/data points.
4. **Fluency Optimization** — clean, well-structured prose.
5. **Easy-to-Understand** — plain language, low reading-level friction.
6. **Unique Words** — distinctive vocabulary/phrasing (aligns with our information-gain gate).
7. **Authoritative** — confident, credential-backed tone.
8. **Technical Terms** — correct domain terminology where it fits the audience.
9. **Keyword Stats** — natural keyword density that matches how the query is phrased.

Implemented as `GEO_TACTICS` in `src/lib/geo.ts`, scored per page in the plan builder.

### Freshness
"State of AI Search Optimization 2026" (Kevin Indig): content under 3 months old is
**3x more likely to be cited**. Implemented as a per-page freshness/refresh-due signal.

### Citation platform concentration (by engine)
- **ChatGPT**: Wikipedia dominates at 47.9% of top citations.
- **Perplexity**: Reddit dominates at 46.7% of citations.
- **Gemini**: also leans heavily on Reddit.
Other frequently-cited platforms: Hacker News, Stack Overflow, Quora, Product Hunt.
Implemented as citation-platform suggestions surfaced per competitor gap (e.g. "seed a
Reddit thread" / "answer this on Quora") rather than a generic to-do.

### llms.txt protocol
A proposed `/llms.txt` standard (like robots.txt) for communicating with LLM crawlers,
authored by Jeremy Howard / AnswerDotAI. Adoption is still small (784+ sites as of
mid-2025) but growing — Stripe, Zapier, Cloudflare, Anthropic, Vercel, Supabase all
publish one. No AI platform has officially committed to reading it, but it costs
nothing to publish and several agencies now generate one automatically.
**We dogfood this**: Ascent's own marketing site now serves `/llms.txt`, and the agent's
publish step will generate/update one for every client site.

### AI crawler access
Explicit allow-list matters: GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot,
Google-Extended, Amazonbot, CCBot (Common Crawl, feeds many LLMs). A site that blocks
these in robots.txt is invisible to answer engines regardless of content quality.
**We dogfood this** in `src/app/robots.ts`.

### What we did NOT implement (and why)
- Wikipedia/Reddit/HN presence-building — genuinely valuable per the data, but it's an
  off-site distribution activity, not something an on-site publishing agent does. Noted
  as a future "Outreach" agent capability, not built now.
- Agentic commerce (UCP / OpenAI's Agentic Commerce Protocol) — not relevant to Ascent's
  SEO-content use case today; revisit if Ascent ever serves ecommerce catalog clients.
- Dedicated GEO SaaS competitors (AthenaHQ, Profound, Ahrefs Brand Radar, etc.) — these
  are citation-tracking tools; our roadmap already has an "AI visibility" dashboard
  panel as a placeholder for this exact capability once the real backend exists.

## Sync log
- **2026-07-16** — initial sync at commit `7c37369`. Implemented the 9-tactic scoring,
  freshness signal, citation-platform suggestions, llms.txt, and AI-crawler robots.txt
  (see commit history on `Row-Claude/leadsmart-seo`).
