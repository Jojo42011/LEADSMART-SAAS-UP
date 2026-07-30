"use client";

/**
 * Onboarding state. Persisted to localStorage for now; swaps to the
 * multi tenant API once the backend lands. Every field here maps to
 * something the agent needs before its first run.
 */

import { useEffect, useState } from "react";

export type Platform = "wordpress" | "github";
export type PublishMode = "autopilot" | "review";
export type Cadence = "daily" | "every3days" | "weekly";

export type OnboardingData = {
  business: {
    name: string;
    phone: string;
    address: string;
    city: string;
    region: string;
    serviceArea: string;
  };
  website: {
    url: string;
    platform: Platform | null;
  };
  publishing: {
    wpUser: string;
    wpAppPassword: string;
    githubRepo: string;
    githubToken: string;
    /** True when GitHub was connected through OAuth; the token lives in an httpOnly cookie server side. */
    githubOauth: boolean;
  };
  searchConsole: {
    connected: boolean;
    skipped: boolean;
  };
  market: {
    industry: string;
    services: string;
    locations: string;
    competitors: string;
    /** Average sale / job value in dollars. Powers revenue projections. */
    avgSaleValue: string;
    /** Keywords the owner wants to win, comma separated. Seeds the queue. */
    wishlist: string;
  };
  launch: {
    cadence: Cadence;
    mode: PublishMode;
  };
};

export const emptyOnboarding: OnboardingData = {
  business: {
    name: "",
    phone: "",
    address: "",
    city: "",
    region: "",
    serviceArea: "",
  },
  website: { url: "", platform: null },
  publishing: { wpUser: "", wpAppPassword: "", githubRepo: "", githubToken: "", githubOauth: false },
  searchConsole: { connected: false, skipped: false },
  market: { industry: "", services: "", locations: "", competitors: "", avgSaleValue: "", wishlist: "" },
  launch: { cadence: "daily", mode: "autopilot" },
};

const KEY = "onboarding.v1";

/**
 * Merges a stored section over its default, keeping only values whose type
 * matches the default. Stored JSON is untrusted input — a number or object
 * where a string is expected would otherwise reach `.split()`/`.replace()`
 * in the plan builder and throw on every render, with no way to recover
 * short of clearing site data by hand.
 */
const PRIMITIVES = ["string", "number", "boolean"];

function mergeSection<T extends object>(fallback: T, stored: unknown): T {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return fallback;
  const out = { ...fallback };
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in fallback)) continue;
    const expected = fallback[key as keyof T];

    // A null default (website.platform) says nothing about the field's type,
    // and `typeof null` is "object", so comparing types against it dropped
    // every stored string — platform silently reverted to null on reload,
    // which left the publishing step's Continue button permanently disabled.
    // Accept null or any primitive here; structures are still rejected.
    if (expected === null) {
      if (value === null || PRIMITIVES.includes(typeof value)) {
        out[key as keyof T] = value as T[keyof T];
      }
      continue;
    }

    if (typeof value === typeof expected) {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}

export function loadOnboarding(): OnboardingData {
  if (typeof window === "undefined") return emptyOnboarding;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyOnboarding;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return emptyOnboarding;
    // Merge per section so data saved before a field existed stays valid.
    return {
      business: mergeSection(emptyOnboarding.business, parsed.business),
      website: mergeSection(emptyOnboarding.website, parsed.website),
      publishing: mergeSection(emptyOnboarding.publishing, parsed.publishing),
      searchConsole: mergeSection(emptyOnboarding.searchConsole, parsed.searchConsole),
      market: mergeSection(emptyOnboarding.market, parsed.market),
      launch: mergeSection(emptyOnboarding.launch, parsed.launch),
    };
  } catch {
    return emptyOnboarding;
  }
}

export function saveOnboarding(data: OnboardingData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable; onboarding still works in memory
  }
}

export function clearOnboarding() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/**
 * Hydrates onboarding state from localStorage after mount (localStorage is
 * browser-only, so the server and the initial client render both use
 * `emptyOnboarding` to stay hydration-safe) and returns an updater that
 * persists every patch immediately.
 */
export function useOnboarding(): [OnboardingData, (patch: Partial<OnboardingData>) => void] {
  const [data, setData] = useState<OnboardingData>(emptyOnboarding);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from a browser-only store (localStorage); the server and first client render intentionally match on emptyOnboarding.
    setData(loadOnboarding());
  }, []);

  const update = (patch: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      saveOnboarding(next);
      return next;
    });
  };

  return [data, update];
}
