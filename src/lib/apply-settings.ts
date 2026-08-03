"use client";

import type { OnboardingData } from "./onboarding";
import { saveOnboarding } from "./onboarding";
import { clearIntel, saveIntel } from "./intel";
import { runLiveResearch } from "./research-client";
import { marketProfileOf, profileChanged, savePlannedProfile } from "./profile";

/**
 * Applies a Settings save across every layer that holds derived state.
 *
 * Three places remember what the agent was told, and before this they
 * drifted apart the moment anyone edited Settings:
 *
 *  1. The plan on screen, recomputed from the saved answers — already live.
 *  2. The research snapshot in localStorage, captured once during
 *     onboarding and then never refreshed, which is why the dashboard kept
 *     showing keyword targets from the original answers.
 *  3. The site row in the engine database, written once at launch, which is
 *     what the daily cycle actually reads.
 *
 * A save now refreshes all three, and tells the engine to drop the stale
 * keyword pool so the next cycle re-researches instead of continuing on the
 * old profile.
 */

export type ApplyStage =
  | "saving"
  | "clearing"
  | "researching"
  | "syncing"
  | "done"
  | "error";

export type ApplyResult = {
  ok: boolean;
  /** False when only cadence/publish-mode style fields changed. */
  replanned: boolean;
  /** Null when the engine is not configured (local demo mode). */
  stored: boolean | null;
  researchRefreshed: boolean;
  cleared?: { keywords: number; competitors: number; drafts: number } | null;
  message: string;
};

async function syncEngine(
  data: OnboardingData,
  replan: boolean
): Promise<{ stored: boolean | null; cleared: ApplyResult["cleared"] }> {
  try {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding: data, replan }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as {
      stored?: boolean;
      cleared?: ApplyResult["cleared"];
    };
    return { stored: json.stored ?? null, cleared: json.cleared ?? null };
  } catch {
    return { stored: null, cleared: null };
  }
}

export async function applySettings(
  data: OnboardingData,
  onStage?: (stage: ApplyStage) => void
): Promise<ApplyResult> {
  const stage = (s: ApplyStage) => onStage?.(s);

  stage("saving");
  saveOnboarding(data);

  const replan = profileChanged(data);

  if (!replan) {
    // Publishing preferences still need to reach the engine, but nothing
    // the agent planned from has changed, so its work stays valid.
    stage("syncing");
    const { stored } = await syncEngine(data, false);
    stage("done");
    savePlannedProfile(marketProfileOf(data));
    return {
      ok: true,
      replanned: false,
      stored,
      researchRefreshed: false,
      message: "Saved. Publishing preferences updated.",
    };
  }

  // Drop the stale snapshot first so nothing on screen keeps showing
  // findings from the previous answers while the new pass runs.
  stage("clearing");
  clearIntel();

  stage("researching");
  const research = await runLiveResearch(data);
  if (research) saveIntel({ research: { ...research, ranAt: new Date().toISOString() } });

  stage("syncing");
  const { stored, cleared } = await syncEngine(data, true);

  savePlannedProfile(marketProfileOf(data));
  stage("done");

  const parts = ["Saved."];
  if (research) parts.push("Research refreshed.");
  if (stored) parts.push("Agent re-planning from the new profile.");
  else if (stored === false) parts.push("Local preview updated; connect the database to re-plan the live agent.");

  return {
    ok: true,
    replanned: true,
    stored,
    researchRefreshed: Boolean(research),
    cleared,
    message: parts.join(" "),
  };
}
