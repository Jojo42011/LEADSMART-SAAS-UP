"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which of the owner's websites the dashboard is currently showing.
 *
 * One account can hold several sites, each with its own agent, keyword
 * plan and queue. Every panel in the dashboard reads from `useAgentPages`,
 * so the selection is applied there once rather than threaded through
 * thirty components — the alternative is a dashboard that shows one site's
 * name in the header while charting another site's pages, which is worse
 * than having no switcher at all.
 *
 * The choice is stored per browser rather than per account: it is a view
 * preference, not a fact about the subscription, and syncing it to the
 * server would mean switching sites on a laptop changed what a phone was
 * looking at mid-session.
 *
 * An id that no longer exists — a site removed from another device, or a
 * stale value after signing into a different account — is ignored rather
 * than honoured, so the dashboard falls back to the first real site
 * instead of rendering empty.
 */

const KEY = "dashboard.activeSite";

export function loadActiveSiteId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * One shared value for the whole page, not one per component.
 *
 * The dashboard calls useAgentPages from several panels independently, so
 * a selection kept in local component state updated only the panel that
 * set it: switching sites renamed the header while the content queue below
 * it carried on showing the previous site's pages. That is precisely the
 * failure a switcher exists to prevent, so the selection lives in a module
 * store that every subscriber is notified of.
 */
let current: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): string | null {
  // Read through on first use rather than at module load: this file is
  // imported during SSR, where localStorage does not exist.
  if (!hydrated && typeof window !== "undefined") {
    current = loadActiveSiteId();
    hydrated = true;
  }
  return current;
}

/** The server has no browser storage, so it always renders "no selection". */
function getServerSnapshot(): string | null {
  return null;
}

export function saveActiveSiteId(siteId: string | null): void {
  current = siteId;
  hydrated = true;
  if (typeof window !== "undefined") {
    try {
      if (siteId) window.localStorage.setItem(KEY, siteId);
      else window.localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable (private mode, quota). The selection still
      // applies for this session; it just does not survive a reload.
    }
  }
  listeners.forEach((fn) => fn());
}

export function useActiveSiteId(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const choose = useCallback((next: string | null) => saveActiveSiteId(next), []);
  return [id, choose];
}
