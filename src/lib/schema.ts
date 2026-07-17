/**
 * Schema.org JSON-LD generation.
 *
 * The build→clean→validate utility pattern here is adapted from
 * traffictorch/traffic-torch's schema-generator (see
 * docs/research/skill-repos-deep-dive.md). Two fixes over that reference:
 * validation is actually enforced before publish (their own UI never called
 * its own validator), and structured fields (opening hours, cost) are built
 * as proper nested schema.org objects instead of raw strings.
 *
 * GEO priority order (highest AI-citation value first), per the same
 * research: FAQPage > WebApplication > WebSite > Article > HowTo. Every
 * generated page should stack multiple relevant schemas, not just one.
 */

export type JsonLd = Record<string, unknown>;

/** Strips null/undefined/empty-string/empty-array/empty-object values recursively. */
export function cleanJsonLd(value: unknown): unknown {
  if (Array.isArray(value)) {
    const cleaned = value.map(cleanJsonLd).filter((v) => v !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (value && typeof value === "object") {
    const out: JsonLd = {};
    for (const [k, v] of Object.entries(value as JsonLd)) {
      const cleaned = cleanJsonLd(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}

export function buildJsonLdSkeleton(type: string, data: JsonLd): JsonLd {
  return cleanJsonLd({ "@context": "https://schema.org", "@type": type, ...data }) as JsonLd;
}

/** Dot-notation required-field validator. Returns every missing/empty path. */
export function validateRequiredFields(data: JsonLd, requiredPaths: string[]): string[] {
  const getNested = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);

  return requiredPaths.filter((path) => {
    const v = getNested(data, path);
    if (v === undefined || v === null || v === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

type BusinessHours = { dayOfWeek: string[]; opens: string; closes: string };

export function localBusinessSchema(input: {
  type?: string; // e.g. "PlumbingService", "Dentist" — prefer the most specific subtype available
  name: string;
  url: string;
  // A factual one-line summary. Optional properties like description are what
  // give AI answer engines the context to cite a page confidently rather than
  // skip it (Fischman SSRN cross-platform study; BrightEdge). See
  // docs/research/community-seo-sync.md 2026-07-17.
  description?: string;
  telephone?: string;
  address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string; addressCountry?: string };
  hours?: BusinessHours[];
  sameAs?: string[];
}): JsonLd {
  return buildJsonLdSkeleton(input.type ?? "LocalBusiness", {
    name: input.name,
    url: input.url,
    description: input.description,
    telephone: input.telephone,
    address: input.address
      ? { "@type": "PostalAddress", ...input.address }
      : undefined,
    // A proper array of OpeningHoursSpecification objects, not a raw string —
    // Google cannot parse free text here.
    openingHoursSpecification: input.hours?.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    })),
    sameAs: input.sameAs,
  });
}

export function faqPageSchema(qa: { question: string; answer: string }[]): JsonLd {
  // 3-10 Q&As is the recommended range; answers must also be visible in the
  // rendered page, never hidden-only, or the schema risks a manual penalty.
  return buildJsonLdSkeleton("FAQPage", {
    mainEntity: qa.slice(0, 12).map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: { "@type": "Answer", text: pair.answer },
    })),
  });
}

export function howToSchema(input: {
  name: string;
  totalTime?: string; // ISO 8601 duration, e.g. "PT45M"
  estimatedCostUsd?: number;
  steps: { name: string; text: string }[];
}): JsonLd {
  return buildJsonLdSkeleton("HowTo", {
    name: input.name,
    totalTime: input.totalTime,
    // A proper MonetaryAmount object, not a bare string.
    estimatedCost: input.estimatedCostUsd
      ? { "@type": "MonetaryAmount", currency: "USD", value: String(input.estimatedCostUsd) }
      : undefined,
    step: input.steps.map((s) => ({ "@type": "HowToStep", name: s.name, text: s.text })),
  });
}

/** Fully automatic from a page's own route hierarchy — no user input or LLM call needed. */
export function breadcrumbListSchema(crumbs: { name: string; url: string }[]): JsonLd {
  return buildJsonLdSkeleton("BreadcrumbList", {
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  });
}

export function organizationSchema(input: { name: string; url: string; description?: string; logo?: string; sameAs?: string[] }): JsonLd {
  return buildJsonLdSkeleton("Organization", {
    name: input.name,
    url: input.url,
    description: input.description,
    logo: input.logo,
    sameAs: input.sameAs,
  });
}
