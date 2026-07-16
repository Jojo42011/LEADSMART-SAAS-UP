/**
 * Onboarding state. Persisted to localStorage for now; swaps to the
 * multi tenant API once the backend lands. Every field here maps to
 * something the agent needs before its first run.
 */

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
  publishing: { wpUser: "", wpAppPassword: "", githubRepo: "", githubToken: "" },
  searchConsole: { connected: false, skipped: false },
  market: { industry: "", services: "", locations: "", competitors: "", avgSaleValue: "" },
  launch: { cadence: "daily", mode: "autopilot" },
};

const KEY = "onboarding.v1";

export function loadOnboarding(): OnboardingData {
  if (typeof window === "undefined") return emptyOnboarding;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyOnboarding;
    const parsed = JSON.parse(raw) as Partial<OnboardingData>;
    // Merge per section so data saved before a field existed stays valid.
    return {
      business: { ...emptyOnboarding.business, ...parsed.business },
      website: { ...emptyOnboarding.website, ...parsed.website },
      publishing: { ...emptyOnboarding.publishing, ...parsed.publishing },
      searchConsole: { ...emptyOnboarding.searchConsole, ...parsed.searchConsole },
      market: { ...emptyOnboarding.market, ...parsed.market },
      launch: { ...emptyOnboarding.launch, ...parsed.launch },
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
