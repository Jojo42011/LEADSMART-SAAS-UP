"use client";

import { useEffect, useState } from "react";

/**
 * The Search Console headline numbers, read once and shared.
 *
 * A deliberately small read: the Analytics tab fetches the same endpoint
 * for its charts, but the Overview and the Strategy tab only need the
 * headline, and pulling the whole payload apart in three places is how
 * those screens end up disagreeing about a number. That is why this lives
 * in its own module rather than inside whichever component happened to
 * need it first. Failures and an unconnected account are the
 * same outcome here — no figure, and the card says why rather than
 * showing a zero that reads as "nobody found you".
 */
export function useSearchSnapshot(): {
  loading: boolean;
  connected: boolean;
  clicks: number | null;
  position: number | null;
  clicksDelta: string | null;
  positionDelta: string | null;
} {
  const [state, setState] = useState({
    loading: true,
    connected: false,
    clicks: null as number | null,
    position: null as number | null,
    clicksDelta: null as string | null,
    positionDelta: null as string | null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics?range=28")
      .then((r) => r.json())
      .then((j: {
        connected?: boolean;
        totals?: { clicks: number; position: number };
        prevTotals?: { clicks: number; position: number };
      }) => {
        if (cancelled) return;
        const t = j.totals;
        const prev = j.prevTotals;
        // Position improves as it falls, so its arrow is inverted. Getting
        // that backwards would report a genuine improvement as a decline.
        const posDelta =
          t && prev && prev.position
            ? `${prev.position - t.position >= 0 ? "▲" : "▼"} ${Math.abs(prev.position - t.position).toFixed(1)} vs previous 28 days`
            : null;
        const clickDelta =
          t && prev
            ? `${t.clicks - prev.clicks >= 0 ? "▲" : "▼"} ${Math.abs(t.clicks - prev.clicks).toLocaleString()} vs previous 28 days`
            : null;
        setState({
          loading: false,
          connected: Boolean(j.connected && t),
          clicks: t?.clicks ?? null,
          position: t?.position ?? null,
          clicksDelta: clickDelta,
          positionDelta: posDelta,
        });
      })
      .catch(() => {
        if (!cancelled) setState((p) => ({ ...p, loading: false, connected: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

