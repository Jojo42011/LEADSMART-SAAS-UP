# Deep Competitive Analyst — source review

**Repo:** https://github.com/ALucek/deep-competitive-analyst
**Reviewed:** 2026-07-27

A "deep agent" competitive-intelligence assistant: `deepagents` + LangGraph
Platform + Perplexity Search. A lead agent decomposes an analysis into atomic
research tasks, spawns parallel `research-agent` sub-agents (one topic each),
then synthesizes three markdown deliverables — two company profiles and one
head-to-head comparison.

## What it actually does (mechanics, not marketing)

- **Architecture:** one orchestrator (`create_deep_agent`) + a compiled
  research sub-agent with `SummarizationMiddleware` (summarize past 120k
  tokens, keep last 20 messages) and `ToolCallLimitMiddleware` (15 calls/run).
  Search is Perplexity's API, rate-limited to 3 req/sec.
- **Query decomposition rule:** queries must be "specific, atomic, and
  scoped" — one topic per agent, run in parallel. The prompt explicitly
  contrasts good ("Research Company A's pricing tiers and model") vs bad
  ("Tell me about Company X").
- **Research dimensions per company:** fundamentals (site, founding, HQ,
  size), positioning/ICP, products and pricing, integrations, customer base
  and notable logos, developments in the last 12 months, differentiators,
  weaknesses, and customer sentiment split into praise vs complaints.
- **Output frameworks:** side-by-side comparison tables with an explicit
  **"Advantage"** column per feature row; a full **SWOT** per company; and
  buyer-facing **"Choose X if…"** recommendations.
- **Evidence discipline (the strongest part):** every factual claim must
  carry a source URL, primary sources preferred, citations repeated after
  each section. Equal research depth for all companies is mandated so the
  comparison isn't biased. Missing data must be stated explicitly, with a
  pointer to where the user can obtain it themselves.

## What we implemented in Ascent

Three ideas transferred cleanly to the Competitors tab:

1. **Two-sided competitive position (`leadItems` / `leadCount`).** Modeled on
   the repo's "Advantage" column. Our tab was entirely deficit-framed — a
   list of what competitors have that you don't. It now also shows the
   keywords *you* cover that a given competitor doesn't, computed as the
   complement of the same mapped keyword set. Symmetric and derived, not
   invented.
2. **Threat ranking (`threat: {level, reason}`).** The repo's executive
   synthesis answers "so what?"; the deterministic analog is ranking
   competitors by how much they actually matter. Derived from keyword
   overlap + Core-gap count + referring-domain authority, with the reasoning
   stated in plain English so the ranking is auditable rather than an opaque
   score. Competitor cards sort highest-threat first.
3. **Estimate labeling.** The repo insists on stating what isn't known.
   Our overlap and referring-domain figures are derived estimates, not
   measured data, but the UI presented them as bare facts. They now carry
   "(est.)" and the tab header points users to Search Console for measured
   data. This matches the transparency-first positioning the whole product
   rests on.

## What we deliberately did NOT implement

- **Company profiles, SWOT, and customer-sentiment sections about named
  competitors.** This is the bulk of the repo's value, and it is exactly what
  Ascent must not generate today. The repo earns those claims with live
  Perplexity research and a hard citation requirement per claim. Ascent has
  no backend and no research tool — generating "Strengths / Weaknesses /
  Common complaints" for a real, named third-party company from a
  deterministic hash would be fabricating claims about identifiable real
  businesses. That is a more serious failure than a fabricated statistic
  (it is potentially defamatory), and it violates the standing fabrication
  guardrail. Deferred until a real backend with a cited research pipeline
  exists — at which point the repo's per-claim citation discipline and
  equal-depth rule are the right model to copy wholesale.
- **The multi-agent/Perplexity architecture itself.** Requires a backend;
  Ascent is frontend-only today. Worth revisiting as the blueprint for the
  research phase when the backend lands: atomic scoped queries, parallel
  sub-agents, summarization middleware for long runs, and tool-call limits.

## If/when the backend lands

The repo is a good template for Ascent's Research phase. Priority order:
1. Atomic-scoped-query decomposition with parallel research agents.
2. Per-claim citation capture (store source URLs alongside every competitor
   fact, so the dashboard can show provenance).
3. Equal-depth enforcement across competitors before any comparison renders.
4. Then, and only then, the richer profile/SWOT/sentiment sections.
