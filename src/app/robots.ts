import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Explicit allow-list for AI answer-engine crawlers. A site that blocks
 * these is invisible to AI search regardless of content quality — see
 * docs/research/geo-source-sync.md for the sourcing on this list.
 */
const AI_CRAWLERS = [
  "GPTBot", // OpenAI / ChatGPT
  "ChatGPT-User",
  "ClaudeBot", // Anthropic / Claude
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended", // Gemini / AI Overviews training
  "Amazonbot",
  "CCBot", // Common Crawl, feeds many LLM training sets
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}
