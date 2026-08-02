"use client";

import { useEffect, useState } from "react";
import { useActiveSiteId } from "./active-site";

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
  /** What the owner calls this site, for the switcher. */
  businessName: string;
  platform: string;
  cadence: string;
  publishMode: string;
  /** False while the owner has production paused. */
  active: boolean;
  lastRunAt: string | null;
  pages: AgentPage[];
  runs: AgentRun[];
};

export type Entitlement = {
  allowed: boolean;
  state: "trialing" | "active" | "grace" | "suspended" | "none";
  reason: string;
  graceEndsAt: string | null;
};

export type AgentState = {
  loading: boolean;
  /**
   * Every site on the account, unscoped — the switcher's list.
   *
   * Kept separate from `sites` so the two questions stay distinct: "what
   * am I looking at" and "what could I look at". Panels that reason about
   * the current site must never accidentally aggregate across all of them.
   */
  allSites: AgentSite[];
  /** The site the dashboard is scoped to, or null before anything loads. */
  activeSite: AgentSite | null;
  /** Switch the dashboard to another of the owner's sites. */
  selectSite: (siteId: string) => void;
  /** True during a manual refresh, so the button can say so — a refetch
   * with no visible acknowledgement reads as a broken button. */
  refreshing: boolean;
  /** False when DATABASE_URL is unset: no engine, so the preview is all there is. */
  engine: boolean;
  /**
   * The active site only, as a one-element list.
   *
   * Deliberately still an array: every consumer already maps over it, and
   * scoping here means a panel cannot forget to. Before the switcher this
   * held all sites and the dashboard silently summed them, so a two-site
   * owner saw one blended set of numbers belonging to neither site.
   */
  sites: AgentSite[];
  /** Why the agent may or may not work, from billing. Null without a store. */
  entitlement: Entitlement | null;
  error: string | null;
};

type Fetched = {
  loading: boolean;
  refreshing: boolean;
  engine: boolean;
  sites: AgentSite[];
  entitlement: Entitlement | null;
  error: string | null;
};

export function useAgentPages(): AgentState & { refresh: () => void } {
  const [state, setState] = useState<Fetched>({
    loading: true,
    refreshing: false,
    engine: false,
    sites: [],
    entitlement: null,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const [activeSiteId, setActiveSiteId] = useActiveSiteId();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pages")
      .then((r) => r.json())
      .then((j: { ok?: boolean; engine?: boolean; sites?: AgentSite[]; entitlement?: Entitlement | null; error?: string }) => {
        if (cancelled) return;
        // Sites can arrive alongside an error: a failed pages read still
        // returns the site list so the agent controls survive it.
        setState({
          loading: false,
          refreshing: false,
          engine: Boolean(j.engine),
          sites: j.sites ?? [],
          entitlement: j.entitlement ?? null,
          error: j.ok === false ? j.error ?? "Could not read pages" : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ loading: false, refreshing: false, engine: false, sites: [], entitlement: null, error: null });
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

  // Resolve the stored id against what actually came back. A stale id —
  // a site deleted elsewhere, or left over from another account on the
  // same browser — must not blank the dashboard, so an unmatched id falls
  // back to the first site rather than to nothing.
  const activeSite =
    state.sites.find((s) => s.siteId === activeSiteId) ?? state.sites[0] ?? null;

  return {
    ...state,
    allSites: state.sites,
    activeSite,
    sites: activeSite ? [activeSite] : [],
    selectSite: setActiveSiteId,
    refresh,
  };
}

/** Every page across all of the owner's sites, newest first. */
export function allPages(sites: AgentSite[]): (AgentPage & { siteUrl: string })[] {
  return sites
    .flatMap((s) => s.pages.map((p) => ({ ...p, siteUrl: s.url })))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
