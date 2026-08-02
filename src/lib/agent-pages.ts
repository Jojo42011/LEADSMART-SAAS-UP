"use client";

import { useEffect, useState } from "react";

/**
 * Reads what the agent has actually written from /api/pages.
 *
 * The dashboard's queue was drawn entirely from the local deterministic
 * preview, so "Drafting" was a label computed from a hash rather than a
 * report of work in progress — it would never change, however long you
 * watched it. This hook supplies the real rows so the preview can be shown
 * as a preview and real output can be shown as real.
 */

export type AgentPage = {
  id: string;
  keyword: string;
  slug: string;
  folder: string;
  title: string;
  status: string;
  live_url: string | null;
  live_status: string | null;
  audit_score: number;
  audit_grade: string;
  held_reason: string | null;
  word_count: number;
  published_at: string | null;
  /** When the agent last rewrote this page in place. */
  refreshed_at: string | null;
  refresh_count: number;
  created_at: string;
};

export type AgentRun = {
  id: string;
  phase: string;
  status: string;
  summary: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AgentSite = {
  siteId: string;
  url: string;
  platform: string;
  cadence: string;
  publishMode: string;
  /** False while the owner has production paused. */
  active: boolean;
  lastRunAt: string | null;
  pages: AgentPage[];
  runs: AgentRun[];
};

export type AgentState = {
  loading: boolean;
  /** True during a manual refresh, so the button can say so — a refetch
   * with no visible acknowledgement reads as a broken button. */
  refreshing: boolean;
  /** False when DATABASE_URL is unset: no engine, so the preview is all there is. */
  engine: boolean;
  sites: AgentSite[];
  error: string | null;
};

export function useAgentPages(): AgentState & { refresh: () => void } {
  const [state, setState] = useState<AgentState>({
    loading: true,
    refreshing: false,
    engine: false,
    sites: [],
    error: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pages")
      .then((r) => r.json())
      .then((j: { ok?: boolean; engine?: boolean; sites?: AgentSite[]; error?: string }) => {
        if (cancelled) return;
        // Sites can arrive alongside an error: a failed pages read still
        // returns the site list so the agent controls survive it.
        setState({
          loading: false,
          refreshing: false,
          engine: Boolean(j.engine),
          sites: j.sites ?? [],
          error: j.ok === false ? j.error ?? "Could not read pages" : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ loading: false, refreshing: false, engine: false, sites: [], error: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // The refreshing flag is set by the caller's event handler rather than
  // synchronously inside the effect: a setState during mount forces a
  // second render before anything has been fetched, for a flag that only
  // ever matters after a click.
  const refresh = () => {
    setState((s) => ({ ...s, refreshing: true }));
    setTick((t) => t + 1);
  };

  return { ...state, refresh };
}

/** Every page across all of the owner's sites, newest first. */
export function allPages(sites: AgentSite[]): (AgentPage & { siteUrl: string })[] {
  return sites
    .flatMap((s) => s.pages.map((p) => ({ ...p, siteUrl: s.url })))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
