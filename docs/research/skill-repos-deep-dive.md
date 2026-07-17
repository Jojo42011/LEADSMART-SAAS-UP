# Six SEO/GEO Tool Repos — Deep-Dive Synthesis for Ascent

Deep dive into six real code repositories (Claude Code skill packs, a Python GEO auditor,
the actual Princeton GEO paper's reference implementation, and a schema-generator tool),
each cloned locally and read in full rather than researched via web search. This is a
different, higher-signal category of source than our agency competitor research — these
are working rubrics, scoring formulas, and prompt templates, not marketing copy.

**Repos researched:**
1. [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) — Claude Code SEO audit plugin
2. [Auriti-Labs/geo-optimizer-skill](https://github.com/Auriti-Labs/geo-optimizer-skill) — Python GEO audit tool
3. [inhouseseo/superseo-skills](https://github.com/inhouseseo/superseo-skills) — Claude Code SEO skill pack
4. [GEO-optim/GEO](https://github.com/GEO-optim/GEO) — the official Princeton/Georgia Tech/Allen Institute GEO paper's code
5. [aaron-he-zhu/aaron-marketing-skills](https://github.com/aaron-he-zhu/aaron-marketing-skills) — paid-ads skill pack (mined for transferable frameworks)
6. [traffictorch/traffic-torch](https://github.com/traffictorch/traffic-torch) — SEO tools marketing site (schema generator + topical authority tool)

---

## Cross-repo theme 1: E-E-A-T scoring appeared independently in 3 repos — here's the reconciled rubric

Three different projects (superseo-skills, aaron-marketing-skills, claude-seo) each built their
own detailed E-E-A-T rubric. They agree on the core structure and disagree only on presentation.
Reconciled version, ready to implement:

**Four factors, 1–10 each** (superseo-skills' version is the most concrete and calibrated):

- **Experience** — the single most predictive factor per multiple sources. Fast test: count
  specific, datable, first-person observations (a number with a year, a named client, a
  timestamped screenshot, a specific error message, "what didn't work before"). **3+ = strong
  (8–10). 0–1 = absent (1–3), regardless of how long the bio is.**
- **Expertise** — states when advice does *not* apply and why; uses natural domain
  terminology; covers 2+ edge cases/tradeoffs. Weak = correct facts with no "it depends."
- **Authoritativeness** — verifiable author identity, part of a topical cluster on the domain
  (not an orphan page), accurate citations to real experts.
- **Trustworthiness** — every stat sourced and dated, conflicts of interest disclosed, hedged
  (not absolute) claims, real changelog/update history.

**Auto-fail red flags** (cap Trustworthiness regardless of the rest):
Person schema + rich bio + zero demonstrated experience in the body; Review schema with no
visible review text; FAQ schema with keyword-stuffed questions no real user would ask;
credentials irrelevant to the content; a "last updated" date that moves while the content
doesn't (checkable against the Wayback Machine).

**Veto mechanic** (aaron-marketing-skills' contribution, worth adopting): a single verified
critical failure caps the *whole page score* at 59/100 regardless of how well everything
else scores — e.g., affiliate non-disclosure, clickbait title/content mismatch, internal
factual contradiction. Two or more verified vetoes = an outright `BLOCK`, no score at all.
This stops "79 good signals, 1 dealbreaker" from washing out into a misleadingly decent
average.

**Content-type weighting** (aaron-marketing-skills): the four E-E-A-T factors shouldn't be
weighted equally for every page type — a testimonial page should weight Experience at ~30%;
a landing page should weight Authority/Trust at ~25% each; a how-to guide should weight
Expertise higher. Ascent's page types (local service pages, comparison pages, FAQ pages)
should each get their own weight profile rather than one fixed global weight.

---

## Cross-repo theme 2: our 9 GEO tactics are correct and complete, but under-specified

**The single most important finding**: the GEO-optim/GEO repo is the actual paper's reference
code. Cross-checking its `GEO_METHODS` dict against our `src/lib/geo.ts` confirms **our 9
tactics map 1:1 onto the real paper — nothing is missing.** But three things are wrong or
incomplete about how we implemented them:

1. **We treat all 9 tactics as equal-weight.** The paper's actual impact data is highly
   uneven: Cite Sources (+30–115%, highest variance), Statistics (+40% avg), Quotation
   (+30–40%) dominate; Unique Words (+5–8%) is explicitly "do not prioritize." Our current
   scoring gives every tactic the same weight.

2. **We score tactics as booleans, not as generation instructions.** The reference prompts
   are genuinely useful writing instructions our page-generation agent should use directly —
   e.g., for Statistics: a *two-pass* protocol (first list where/what stats to insert, then
   write the text with them woven in subtly, never as a standalone stat-dump paragraph); for
   Cite Sources: natural-prose attribution capped at 5–6 per page, not academic-style
   brackets.

3. **⚠️ Important ethical flag, not a recommendation to implement:** the reference
   implementation's actual prompts explicitly permit **fabricated** quotes, statistics, and
   citations ("may be invented but must sound plausible") — the paper is studying whether
   fabrication games LLM citation behavior, which it does. **Ascent must not do this.** Every
   tactic we implement (citations, quotes, stats) must pull from real, verifiable data our
   agent actually has (the business's own facts, real customer reviews, real published
   research) — fabricating "authoritative-sounding" stats or quotes is dishonest, a legal
   liability for our customers, and antithetical to Ascent's whole pitch of being a
   trustworthy alternative to sketchy agencies. This is flagged explicitly so future work on
   `geo.ts` never quietly imports the paper's literal prompts.

**Additional GEO refinements found across the other repos:**
- **geo-optimizer-skill's domain-weighting table**: Quotation matters far more for
  Finance/Health/History content than for generic Media content; Easy-to-Understand matters
  more for Health/Media than Science. Worth a small per-industry weight table.
- **A negative-signals penalty side we don't have at all**: keyword-stuffing density,
  thin-content flags (<300 words), excessive CTA/self-promotion density should all *subtract*
  from the GEO score. Currently `geo.ts` only rewards, never penalizes.
- **Category-weighted scoring with bands**: geo-optimizer-skill's 8-category, point-weighted
  rubric (robots.txt 18pts, llms.txt 18pts, Schema 16pts, Meta 14pts, Content 12pts, Signals
  6pts, AI Discovery 6pts, Brand/Entity 10pts) rolling up to Excellent(86-100)/Good(68-85)/
  Foundation(36-67)/Critical(0-35) bands is a cleaner shape than our current flat count.

---

## Cross-repo theme 3: our AI-crawler allowlist is incomplete and undifferentiated

Our current `robots.ts` allows 8 bots. The geo-optimizer-skill repo's `ai-bots-list.md`
reference reveals real gaps:

**Missing critical bots:**
- **`OAI-SearchBot`** — 🔴 the bot that actually decides ChatGPT *Search* citations. This is
  distinct from `GPTBot` (training-only) and we currently only allow the wrong one for
  citation purposes.
- **`Bingbot`** — Microsoft Copilot has no separate crawler; it's fed by the Bing index, so
  allowing Bingbot *is* allowing Copilot visibility.
- **`Perplexity-User`** — the on-demand fetch bot when a user clicks a Perplexity citation
  (distinct from the crawl-time `PerplexityBot` we already allow).
- **`Applebot` / `Applebot-Extended`** — Siri/Spotlight Search and Apple Intelligence.
- **`claude-web`** — distinct from `ClaudeBot`.

**A more mature model than a flat allow-list**: separate *training* crawlers
(GPTBot/anthropic-ai/Google-Extended/CCBot) from *citation* crawlers
(OAI-SearchBot/ClaudeBot/PerplexityBot/Bingbot). A client may want their content cited in AI
answers without feeding model training — that's a legitimate, increasingly common ask, and
a two-tier robots.txt with a Settings toggle ("allow AI training on my content: yes/no")
is a differentiated feature no competitor agency offers.

---

## Cross-repo theme 4: schema.org — priority order and a clean utility pattern

**GEO-specific schema priority** (geo-optimizer-skill), different from generic SEO priority:
**FAQPage first** ("AI engines use these schemas to answer questions directly") > WebApplication
(for tools) > WebSite > Article > HowTo. Multi-schema stacking on one page (WebSite +
Article + FAQPage + BreadcrumbList together) scores better than any single schema alone, and
a schema needs **5+ populated attributes** to get full credit — presence/absence alone is a
weak signal.

**traffic-torch's `schema-base.js` utility pattern** is genuinely production-quality and
directly portable: `buildJsonLdSkeleton(type, data)` → `cleanJsonLd()` (strips every
null/undefined/empty field so the emitted JSON-LD is always spec-clean) → `validateRequiredFields()`
(dot-notation nested-path validator). One catch worth noting: their own UI never actually
*calls* the validator before emitting schema — we should not repeat that gap; Ascent's
publish pipeline should hard-validate required schema fields before a page goes live.

**Concrete field-level fixes worth encoding for our most-used type (LocalBusiness)**, since
traffic-torch's implementation has two real spec-compliance bugs worth avoiding:
- `openingHoursSpecification` must be a proper array of
  `{"@type":"OpeningHoursSpecification", dayOfWeek, opens, closes}` objects, not a raw string
  (Google can't parse a string).
- Country/region defaults must come from the client's actual onboarding data, never hardcoded.
- Pick the most specific schema.org subtype available (`PlumbingService`, `Dentist`,
  `HairSalon`, etc.) rather than generic `LocalBusiness` when the client's industry maps to one.

**BreadcrumbList is a free win**: it requires zero user input and zero LLM call — it's fully
derivable from Ascent's own page-route hierarchy (position = depth, name = page title, item =
absolute URL). Every generated page should get one automatically.

---

## Cross-repo theme 5: on-page factor priority is causal, not a flat checklist

superseo-skills' `pop-test-hierarchy.md` cites a real methodology (Kyle Roof's controlled
testing, US Patent 10,540,263) establishing a strict fix-order:

- **Group A (critical, fix first, always)**: meta title, body content, URL, H1
- **Group B (important)**: H2/H3/H4, internal-link anchor text pointing to the page
- **Group C (supporting)**: bold/italic, image alt text
- **Group D (near-zero direct ranking impact)**: schema markup, HTML tags, Open Graph, meta
  description, meta keywords

Two counter-intuitive findings worth encoding as explicit rules rather than assumptions:
**schema markup has zero direct ranking effect** (it drives SERP features/CTR, not rankings —
route schema findings to a "rich-result eligibility" bucket, not a ranking-impact bucket,
except for YMYL pages with zero E-E-A-T signals, where schema becomes substrate for trust
classifiers and should be escalated). **Meta description also has zero ranking effect** —
CTR-only. And: **contextual in-body internal links measurably outperform nav/footer/sidebar
links** — a real SearchPilot split test found 5–25% organic traffic uplift from in-body
contextual links vs. only ~5% from footer placement.

**Implication for Ascent**: when our audit surfaces multiple issues on a page, they should be
*sorted by group* before sorted by score-delta, so a weak title tag always outranks ten
missing alt attributes in what the agent fixes first.

---

## Cross-repo theme 6: content clustering, gap analysis, and safe link pacing

**Hub-and-spoke cluster structure** (superseo-skills): a pillar page (3,000–5,000+ words,
broad seed keyword, table of contents, 3–6 core subtopic H2s at overview depth) plus 8–15
spoke articles (long-tail, one question each, linking back to the hub with contextual
anchors). **Publishing sequence matters**: publish 3–4 spokes first, then the hub (which
links to the now-existing spokes), then the remaining spokes — a hub published first launches
as a link-less orphan. This maps directly onto Ascent's 90-day roadmap generator, which
currently doesn't structure output as an explicit hub+spoke graph.

**Gap classification, a clean 4-bucket taxonomy** (superseo-skills' semantic-gap-analysis):
every content gap gets classified by 3 questions (how many of the top-3 competitors cover it,
how deep, does it correlate with rank) into: **Core** (3/3 cover it substantively — must add),
**Differentiator** (1-2/3 cover it and outrank the rest — add if scope allows),
**Commodity** (3/3 cover it but shallow everywhere — a sentence, not a section), **Opportunity**
(0/3 cover it, passes an "would an expert expect this" test — this is where Ascent should
compete on originality, tying directly into our existing information-gain gate). This is a
much better structure for Ascent's Competitors tab than the current flat gap-keyword list.

**Anchor-text and link-velocity safety rules** (superseo-skills' linkbuilding skill) — only
relevant if/when Ascent ever recommends or tracks backlinks, but concrete enough to note now:
exact-match anchor text should stay under 3–5% of a link profile (branded 40–55%, naked URL
15–20%, generic 15–20%, partial-match 10–15%); safe monthly link-building pace scales by site
age/authority phase, and *consistency beats bursts* (10/month every month beats 40-then-0).

---

## Cross-repo theme 7: audit architecture patterns worth adopting regardless of SEO content

Several repos (claude-seo, aaron-marketing-skills, geo-optimizer-skill) converge on the same
underlying audit-system architecture, independent of what's being audited:

- **Status ≠ Verdict**: whether an audit *ran successfully* (status: done/blocked/needs-input)
  is a different axis from whether the thing being audited *passed* (verdict: ship/fix/block).
  Conflating these is a common bug — "the crawl finished" isn't the same claim as "the page
  is good."
- **A structured recommendation schema**, not just a score: every finding should carry (1) the
  observation it rests on, (2) its dependency on other recommendations (can it be done in
  parallel, or does it require another fix first), (3) a falsifiability check ("how would we
  know this failed?"), (4) a leading indicator to monitor afterward. This is a much richer
  data model than "here's a number."
- **Content-decay monitoring pattern** (aaron-marketing-skills' budget-pacing/fatigue-manager,
  generalized): fix a baseline right after a page stabilizes post-publish, track the *slope*
  over time rather than single snapshots, separate the observed effect (traffic dropped) from
  the diagnosed cause (stale content vs. a competitor's new page vs. an algorithm update) since
  each cause implies a different fix, and gate against noise windows (don't trigger a refresh
  alert immediately post-publish or during a known algorithm-update rollout). This is close to
  a spec for the "freshness/refresh" feature we already have a stub of in `geo.ts` — it should
  become a proper monitoring loop, not just a static age counter.
- **Never let automation auto-execute a business decision from stats alone**
  (aaron-marketing-skills' ad-test-designer): if Ascent ever A/B-tests page variants, a
  precommitted owner + action rule must exist *before* the test runs; the stats module itself
  should only ever output `UNDECIDED` absent that, never auto-apply a "winning" variant.

---

# Recommendations — prioritized for Ascent

## Tier 1: high-value, cheap, ready to implement now
1. **Fix the AI-crawler allowlist** (`src/app/robots.ts`): add `OAI-SearchBot`, `Bingbot`,
   `Perplexity-User`, `Applebot`, `Applebot-Extended`, `claude-web`. Five-minute fix with a
   concrete, previously-unknown-to-us gap (`OAI-SearchBot` is genuinely important and easy to
   miss since `GPTBot` sounds like it should cover it).
2. **Weight the 9 GEO tactics instead of treating them equally** (`src/lib/geo.ts`): apply the
   paper's real impact magnitudes (Cite Sources/Statistics/Quotation dominant, Unique Words
   least important) to the score calculation.
3. **Add a negative-signals penalty pass** to GEO scoring: keyword-stuffing density,
   thin-content flag, excessive CTA density should subtract points, not just fail to add them.
4. **BreadcrumbList schema on every page**, fully automatic from route hierarchy — zero cost,
   zero LLM call, currently missing entirely.
5. **Reconcile the 3 competing E-E-A-T rubrics into one** and use it as the actual scoring
   logic behind our "Substance"/"Signal" pillars, including the veto/cap mechanic (one
   critical failure caps the whole page at 59, not just a partial deduction).

## Tier 2: real value, moderate implementation effort
6. **Gap classification (Core/Differentiator/Commodity/Opportunity)** replacing the current
   flat `gapKeywords` list in the Competitors tab — directly reuses infrastructure we already
   have (`CompetitorRow`), just restructures the output.
7. **Hub-and-spoke structuring of the 90-day roadmap**, with the sequencing rule (spokes
   before hub) — upgrades the roadmap generator's current flat keyword-to-page mapping.
8. **On-page fix-priority ordering** (Group A→B→C→D) — when the audit surfaces multiple
   issues, sort by group first, not just by numeric score delta.
9. **Category-weighted GEO score with bands** (Excellent/Good/Foundation/Critical) replacing
   the current flat 0-9 tactic count — clearer for the dashboard, matches how both
   geo-optimizer-skill and claude-seo present it.
10. **Content-type weighting** for pillar scores (landing page vs. FAQ vs. local-service page
    get different factor weights) rather than one fixed global weight.

## Tier 3: real value, needs the backend (roadmap items, not buildable on today's static plan.ts)
11. **A real content-decay monitor**: baseline-after-stabilization, slope-not-snapshot,
    cause-diagnosis routing to a specific fix action. Our current `freshness` field is a
    static age counter; this is the spec for turning it into an actual monitoring loop once
    Ascent has live ranking data.
12. **Schema validation actually enforced pre-publish** (not just generated) — needs a real
    publish pipeline to gate against.
13. **A/B page-variant testing** with the owner+precommitted-action-rule guardrail — only
    relevant once Ascent can actually run experiments against live traffic.

## Explicitly rejected
- **Fabricated quotes/statistics/citations** — the GEO paper's actual reference prompts permit
  this to study whether it works (it does, for gaming citation behavior). Ascent will not
  implement this under any framing. Every citation, quote, and statistic our agent generates
  must come from real, verifiable source material.
