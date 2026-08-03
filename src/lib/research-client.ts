"use client";

import type { OnboardingData } from "./onboarding";
import { saveIntel, type Research } from "./intel";

/**
 * Runs one live market-research pass from the browser and caches the
 * result, without the full Settings re-plan ceremony.
 *
 * Settings' "Save changes" refreshes research as part of clearing and
 * rebuilding the whole plan (apply-settings.ts). The Competitors and
 * Keywords tabs need the same live pass on demand — "find competitors",
 * "generate keywords" — but nothing else: no clearing drafts, no engine
 * re-plan, just fresh findings folded into the plan the dashboard already
 * recomputes from the intel snapshot. This is that narrower operation, and
 * the single place the fetch shape lives so the two callers cannot drift.
 */
export async function runLiveResearch(
  data: OnboardingData
): Promise<Research | null> {
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business: data.business,
        market: data.market,
        websiteUrl: data.website.url,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const research = (await res.json()) as Research;
    // The engine always returns keywords (deterministic fallback included),
    // so an empty or malformed keywords array means the call did not really
    // succeed — treat it as a failure rather than caching an empty result.
    if (!research || !Array.isArray(research.keywords)) return null;
    return research;
  } catch {
    return null;
  }
}

/**
 * Runs research and, on success, writes it to the intel cache stamped with
 * the time it ran. Returns the saved snapshot, or null on failure so the
 * caller can surface the error rather than silently showing stale data.
 */
export async function refreshAndSaveResearch(
  data: OnboardingData
): Promise<Research | null> {
  const research = await runLiveResearch(data);
  if (!research) return null;
  const stamped = { ...research, ranAt: new Date().toISOString() };
  saveIntel({ research: stamped });
  return stamped;
}
