"use client";

/**
 * Client store for what the agent has learned: the site ingest snapshot
 * and the first research cycle. Lives in localStorage alongside onboarding
 * state until the tenant database lands; the dashboard reads it to show
 * real findings instead of simulations.
 */

export type SiteIngest = {
  ok: boolean;
  url: string;
  platform: "wordpress" | "github" | "unknown";
  title: string;
  description: string;
  h1: string;
  phone: string;
  navLinks: string[];
  colors: string[];
  fonts: string[];
  pageCount: number | null;
};

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

export function saveIntel(patch: Partial<Intel>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadIntel(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable; intel is a cache, never required
  }
}
