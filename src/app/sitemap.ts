import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Referenced by robots.ts — an SEO product whose own robots.txt pointed at a
 * 404 sitemap would be embarrassing. Static routes only; per-client generated
 * pages get their own sitemaps once the real backend lands.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${site.domain}`;
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/ai-information`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/signup`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/signin`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
