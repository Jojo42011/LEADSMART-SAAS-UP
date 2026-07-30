"use client";

import type { OnboardingData } from "./onboarding";

/**
 * The answers the agent actually plans from.
 *
 * Changing any of these invalidates everything downstream: the keyword
 * pool, the competitor set, the research snapshot and the page queue were
 * all derived from them. Changing anything else — publishing cadence,
 * publish mode, phone number — leaves the plan valid, so the agent should
 * not throw away work and start over for those.
 */
export function marketProfileOf(data: OnboardingData): string {
  return JSON.stringify({
    name: data.business.name.trim().toLowerCase(),
    city: data.business.city.trim().toLowerCase(),
    region: data.business.region.trim().toLowerCase(),
    serviceArea: data.business.serviceArea.trim().toLowerCase(),
    url: data.website.url.trim().toLowerCase().replace(/\/$/, ""),
    industry: data.market.industry.trim().toLowerCase(),
    services: data.market.services.trim().toLowerCase(),
    locations: data.market.locations.trim().toLowerCase(),
    competitors: data.market.competitors.trim().toLowerCase(),
    wishlist: data.market.wishlist.trim().toLowerCase(),
  });
}

const KEY = "profile.v1";

/** The profile the current plan and research snapshot were built from. */
export function loadPlannedProfile(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function savePlannedProfile(profile: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, profile);
  } catch {
    // storage unavailable; the worst case is an unnecessary replan
  }
}

/**
 * True when the saved answers differ from the ones the current plan was
 * built on. Null means nothing has been recorded yet (first save after
 * onboarding), which counts as changed so the profile gets stamped.
 */
export function profileChanged(data: OnboardingData): boolean {
  const previous = loadPlannedProfile();
  return previous === null || previous !== marketProfileOf(data);
}
