import { site } from "@/lib/site";

/**
 * llms.txt — a proposed standard (like robots.txt) for giving LLM crawlers a
 * clean, structured summary of a site instead of making them parse HTML.
 * Spec: https://github.com/AnswerDotAI/llms-txt. Adoption is still small and
 * no AI platform has officially committed to reading it, but it costs
 * nothing to publish and several notable companies (Stripe, Zapier,
 * Cloudflare, Anthropic, Vercel) already do. Source and rationale in
 * docs/research/geo-source-sync.md.
 *
 * The agent generates one of these for every client site at publish time,
 * kept in sync with the page queue. This file is Ascent's own.
 */

function buildLlmsTxt(): string {
  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    "## Product",
    "",
    `- [Homepage](https://${site.domain}/): Overview, pricing, and how the agent works.`,
    `- [AI information](https://${site.domain}/ai-information): Canonical, citable facts about ${site.name} for AI assistants and answer engines.`,
    "",
    "## Key facts",
    "",
    `- ${site.name} is autonomous SEO software, not an agency: it researches a market, writes pages built to rank, and publishes them to the client's live site on a schedule.`,
    "- Pricing is public and month to month: $49 per website per month, everything included.",
    "- Every page is scored against three pillars (Substance, Signal, Structure) and an information-gain check before it publishes.",
    "",
    "## Contact",
    "",
    `- Sign up: https://${site.domain}/signup`,
  ];
  return lines.join("\n") + "\n";
}

export async function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
