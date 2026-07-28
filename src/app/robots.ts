import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * AI crawlers, split by what they actually do. A site that blocks the
 * citation tier is invisible to AI answer engines regardless of content
 * quality; the training tier is a separate, more sensitive question some
 * clients may want to opt out of independently. See
 * docs/research/skill-repos-deep-dive.md ("AI-crawler allowlist") for the
 * sourcing on this split.
 */

/** Feed model training data. Blocking these has no effect on citation visibility. */
const TRAINING_CRAWLERS = [
  "GPTBot", // OpenAI training
  "ClaudeBot", // Anthropic training (per Anthropic's official three-bot docs)
  "anthropic-ai", // Anthropic legacy training token
  "Google-Extended", // Gemini / AI Overviews training
  "CCBot", // Common Crawl, feeds many third-party LLM training sets
  "Applebot-Extended", // Apple Intelligence training
  "Meta-ExternalAgent", // Meta AI training / indexing (Llama, Meta AI assistant)
  "cohere-ai", // Cohere training
];

/** Power live citations in AI answers. Blocking these makes a site invisible to AI search. */
const CITATION_CRAWLERS = [
  "OAI-SearchBot", // decides ChatGPT Search citations — distinct from GPTBot
  "ChatGPT-User",
  "Claude-SearchBot", // indexes for Claude's search results (Anthropic official docs)
  "Claude-User", // user-initiated fetches from Claude.ai queries
  "claude-web", // legacy Anthropic retrieval token, kept for compatibility
  "PerplexityBot",
  "Perplexity-User", // on-demand fetch when a user clicks a Perplexity citation
  "Bingbot", // Microsoft Copilot has no separate crawler; Bing index membership is a precondition for a Copilot citation
  "Amazonbot",
  "Applebot", // Siri / Spotlight Search
];

const AI_CRAWLERS = [...TRAINING_CRAWLERS, ...CITATION_CRAWLERS];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}
