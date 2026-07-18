"use client";

/**
 * Demo billing state. The checkout page sets this flag and onboarding
 * requires it. Swaps to real Stripe subscription checks (webhook driven,
 * server side) when Stripe is attached.
 */

const KEY = "billing.v1";

export type Billing = {
  active: boolean;
  sites: number;
  activatedAt?: string;
};

export function loadBilling(): Billing {
  if (typeof window === "undefined") return { active: false, sites: 1 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { active: false, sites: 1 };
    return { active: false, sites: 1, ...JSON.parse(raw) };
  } catch {
    return { active: false, sites: 1 };
  }
}

export function saveBilling(b: Billing) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // storage unavailable; checkout still proceeds in memory
  }
}
