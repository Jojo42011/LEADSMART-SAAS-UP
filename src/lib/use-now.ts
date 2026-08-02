"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, as a value a component may read during render.
 *
 * Calling Date.now() directly in a render body is impure: the same props
 * produce different output, which breaks memoisation and blocks the React
 * compiler from optimising the component (it is a hard error under
 * react-hooks/purity). Everything here is derived from timestamps — "10d
 * ago", "due now", pages per day — so the clock has to come from
 * somewhere legitimate.
 *
 * useSyncExternalStore is that somewhere: the snapshot is read outside
 * render and stays stable for the component's lifetime unless something
 * subscribes to changes. Nothing here needs a ticking clock — a dashboard
 * that silently rewrites "10d ago" to "11d ago" mid-session would be
 * churn, not accuracy — so subscribe is a no-op and the value is fixed at
 * mount. The server snapshot is 0, which renders the same "—" placeholder
 * a page with no timestamps would.
 */
const noopSubscribe = () => () => {};
let mountedAt = 0;

export function useNow(): number {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      // One timestamp per page load, shared across every component that
      // asks: two cards computing "days ago" from clocks milliseconds
      // apart could disagree at a day boundary.
      if (!mountedAt) mountedAt = Date.now();
      return mountedAt;
    },
    () => 0
  );
}
