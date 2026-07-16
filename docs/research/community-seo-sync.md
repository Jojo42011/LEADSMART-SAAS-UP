# Community SEO/AEO/GEO Daily Sync

A daily learning loop that keeps Ascent's agent current with how the SEO / AEO /
GEO community is thinking, and turns anything concrete and new into changes to
the agent's scoring, planning, or dashboard.

**Intended sources:** r/SEO, r/TechSEO, and r/aeo on Reddit, plus the wider
practitioner conversation (Search Engine Land, Ahrefs, industry AEO guides, etc.)

## Important limitation (read before relying on this)

**Reddit cannot be fetched from this environment.** Direct fetches of
`reddit.com` and `old.reddit.com` both fail, and `site:reddit.com` searches
return nothing here. So the daily Routine cannot literally scrape those three
subreddit pages. Instead it does the next best thing that actually works:

1. It *attempts* Reddit each run (in case access changes), via WebFetch on
   `reddit.com` / `old.reddit.com` / the `.json` endpoints.
2. When that's blocked, it falls back to broad WebSearch on the topics those
   subreddits cover — Google algorithm updates, technical SEO, AI Overviews,
   AEO/GEO citation tactics, ChatGPT/Perplexity/Gemini ranking behavior — plus
   general "AEO best practices 2026"-style queries that surface the same
   practitioner knowledge the subreddits discuss.

If Reddit access is ever restored, the Routine will pick it up automatically.

## How the sync works (daily Routine "Community SEO/AEO/GEO daily sync")

1. Read this file to see what's already been captured and applied (avoid churn).
2. Gather the day's signal (Reddit attempt → WebSearch fallback, several queries).
3. Extract only **concrete, actionable, genuinely new** insights for Ascent —
   things that change `src/lib/geo.ts` scoring/weights, `src/lib/plan.ts`
   logic, `src/app/robots.ts` crawler list, `src/lib/schema.ts`, or dashboard
   messaging. Ignore generic advice we already encode.
4. Implement what's actionable, following existing patterns. If nothing is
   genuinely new, implement nothing — a quiet day is a valid outcome.
5. Append a dated entry to the log below (what was seen, what was applied, or
   why nothing was). Update "last synced" date.
6. `npm run build` to verify, then commit + push to `Row-Claude/leadsmart-seo`.
7. Only message the user if something meaningful shipped.

**Guardrail:** never implement fabrication tactics (fake quotes/stats/citations),
even if the community discusses them. Ascent only generates from real,
verifiable source material. This stance is fixed.

**Last synced:** 2026-07-16

## Baseline captured at setup (2026-07-16)

Current community consensus, cross-checked against what Ascent already does:

- **Freshness is a top-3 controllable citation factor** — ~83% of AI citations
  for commercial/evaluation queries come from pages updated within 12 months,
  60%+ within 6 months. → *Already implemented* (freshness scoring in
  `geo.ts`, refresh-due signal; content <90d flagged Fresh).
- **Answer-first structure** — lead with the direct answer, don't build to it.
  → *Already implemented* as a core GEO/retrievability principle.
- **~85% of AI brand mentions originate from third-party sources**, not the
  brand's own site. → *Partially captured* via our off-site citation-platform
  suggestions (Reddit/Quora/Wikipedia by engine). Off-site distribution
  execution remains out of scope for an on-site publishing agent; noted as a
  future "Outreach" capability.
- **Platform-specific citation preferences** — ChatGPT favors authoritative
  long-form; Perplexity favors fresh, well-cited articles and is the fastest
  feedback loop (near-real-time inline citations); Google AI Overviews favor
  content already ranking top-10 organically. → *Partially captured*; the
  AI-visibility panel already separates engines. A future refinement could
  weight tactics per target engine.
- **AEO extends SEO, doesn't replace it** — best AEO content is also strong
  traditional SEO. → *Consistent* with our combined Ascent Method + GEO scoring.

No code changes needed at setup — the current community consensus is already
reflected in the implementation. This baseline exists so future daily runs only
act on what's genuinely new beyond this.

## Sync log

- **2026-07-16** — Setup + baseline. Confirmed the implementation already
  matches current AEO/SEO/GEO best-practice consensus (freshness, answer-first,
  third-party citations, platform differences). No code changes. Documented the
  Reddit-fetch limitation and the WebSearch fallback strategy.
