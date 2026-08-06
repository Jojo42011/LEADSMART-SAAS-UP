"use client";

/**
 * Client store for what the agent has learned: the site ingest snapshot
 * and the first research cycle. Lives in localStorage alongside onboarding
 * state until the tenant database lands; the dashboard reads it to show
 * real findings instead of simulations.
 */

/**
 * The site-analysis snapshot, defined once in src/lib/site-ingest.ts.
 *
 * This module used to keep its own copy of the shape, and the two drifted
 * exactly as duplicated types do: the real ingest grew nav, footerLinks
 * and logo — which generated pages depend on to reproduce a customer's
 * header — while this copy still described the older, smaller object, so
 * anything reading the snapshot through this type could not see fields
 * that were genuinely there. Re-exported rather than restated so there is
 * one definition to keep current.
 *
 * A type-only import, so nothing from the server-side ingest module (dns,
 * sockets) is pulled into the browser bundle.
 */
import type { SiteIngest } from "./site-ingest";
export type { SiteIngest };

export type ResearchKeyword = {
  keyword: string;
  intent: string;
  difficulty: string;
  opportunity: number;
  reason: string;
};

export type ResearchCompetitor = {
  domain: string;
  strength: string;
  weakness: string;
};

export type Research = {
  source: "live" | "deterministic";
  competitors: ResearchCompetitor[];
  keywords: ResearchKeyword[];
  summary: string;
  ranAt?: string;
};

export type Intel = {
  ingest?: SiteIngest;
  research?: Research;
};

const KEY = "intel.v1";

export function loadIntel(): Intel {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Intel;
  } catch {
    return {};
  }
}

/**
 * Drops the research snapshot when the answers it was derived from change.
 * Keeping it would leave the dashboard showing keyword targets and
 * competitor findings from a market profile the owner has already replaced.
 */
export function clearIntel() {
  if (typeof window === "undefined") return;
  try {
    const { ingest } = loadIntel();
    // The site ingest describes the website itself (brand, platform), not
    // the market answers, so it survives a market-profile change.
    window.localStorage.setItem(KEY, JSON.stringify(ingest ? { ingest } : {}));
  } catch {
    // storage unavailable; intel is a cache, never required
  }
}

export function saveIntel(patch: Partial<Intel>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadIntel(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable; intel is a cache, never required
  }
}
