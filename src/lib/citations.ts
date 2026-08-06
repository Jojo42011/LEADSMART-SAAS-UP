import { CORE_LOCAL_CITATIONS } from "./geo";

/**
 * The citations tool, built the compliant way.
 *
 * Matthew's original ask was an agent that auto-registers the business on
 * every directory. That version was researched and rejected: automated
 * account creation violates most directories' terms (their CAPTCHAs and
 * verifications exist to block exactly it), Google's spam policy names
 * automated directory submission as link spam, and our own 07-30
 * research says citation value follows a power law — one high-authority
 * listing beats dozens of small ones, so bulk registration wasn't even
 * the effective version of the idea. What survives is the part that
 * genuinely helps: the agent knows WHICH listings matter for this
 * business, prepares a byte-identical data pack to paste into each one,
 * and tracks what's done.
 *
 * The pack is the real product. NAP consistency — the same name, address
 * and phone, character for character, on every listing — is a local
 * ranking signal in its own right, and inconsistency is how a business
 * ends up looking like two businesses to an engine. One canonical block
 * with copy buttons is what makes consistency the path of least
 * resistance.
 *
 * The catalog is deliberately SHORT. Adding a directory to this list is
 * a claim that a listing there moves local visibility, and the evidence
 * says that claim is true for very few of them.
 */

export type DirectoryTier = "core" | "industry" | "general";

export type Directory = {
  /** Stable identifier; also the storage key for status tracking. */
  key: string;
  name: string;
  /** Where the owner claims or creates the listing. */
  url: string;
  tier: DirectoryTier;
  /** Why this one is on the list — shown to the owner, so it must be true. */
  why: string;
};

/**
 * The six core profiles, from geo.ts's CORE_LOCAL_CITATIONS — one list,
 * defined once; this table adds the claim URLs and the reasons.
 */
const CORE_DETAILS: Record<string, { key: string; url: string; why: string }> = {
  "Google Business Profile": {
    key: "google-business",
    url: "https://business.google.com/create",
    why: "The single strongest local signal there is — Maps, the local pack, and Gemini's local answers all read it.",
  },
  Yelp: {
    key: "yelp",
    url: "https://business.yelp.com",
    why: "Heavily cited by AI assistants for local recommendations, and feeds Apple Maps reviews.",
  },
  "Bing Places": {
    key: "bing-places",
    url: "https://www.bingplaces.com",
    why: "Bing's index is what Microsoft Copilot cites from — an unclaimed listing here is invisible to it.",
  },
  "Apple Business Connect": {
    key: "apple-business",
    url: "https://businessconnect.apple.com",
    why: "Apple Maps and Siri read this directly; it is the only way to control your listing there.",
  },
  "Better Business Bureau": {
    key: "bbb",
    url: "https://www.bbb.org/get-listed",
    why: "A high-authority trust citation that answer engines weight when recommending a business.",
  },
  Nextdoor: {
    key: "nextdoor",
    url: "https://business.nextdoor.com",
    why: "Neighbourhood recommendations — the word-of-mouth surface for local service work.",
  },
};

const GENERAL: Directory[] = [
  {
    key: "foursquare",
    name: "Foursquare",
    url: "https://business.foursquare.com",
    tier: "general",
    why: "Its places data syndicates to Uber, Apple and dozens of apps — one listing, many surfaces.",
  },
  {
    key: "yellowpages",
    name: "Yellow Pages",
    url: "https://www.yellowpages.com",
    tier: "general",
    why: "A long-established citation source engines still cross-reference for NAP consistency.",
  },
];

/**
 * Industry packs, matched against the industry AND services text. Each
 * entry is a directory with real pull in its vertical — the bar for
 * being here is "a customer would actually search this site", not "this
 * site accepts listings".
 */
const INDUSTRY_PACKS: { match: RegExp; directories: Directory[] }[] = [
  {
    match: /plumb|hvac|heating|cooling|roof|pool|landscap|lawn|electric|contractor|clean|pest|garage|paint|remodel|renovat|handyman|fenc|floor|concrete|tree|gutter|window|solar|construction/i,
    directories: [
      { key: "angi", name: "Angi", url: "https://www.angi.com", tier: "industry", why: "The biggest home-services review directory; its pages rank for \"best <trade> near me\" searches." },
      { key: "homeadvisor", name: "HomeAdvisor", url: "https://pro.homeadvisor.com", tier: "industry", why: "Paired with Angi in most home-services searches; a listing carries the review profile." },
      { key: "thumbtack", name: "Thumbtack", url: "https://www.thumbtack.com/pro", tier: "industry", why: "Ranks well for service-plus-city queries and is cited in AI recommendation lists." },
      { key: "houzz", name: "Houzz", url: "https://www.houzz.com/pro", tier: "industry", why: "The portfolio directory for anything design-adjacent — remodels, pools, landscaping." },
    ],
  },
  {
    match: /law|attorney|legal|paralegal/i,
    directories: [
      { key: "avvo", name: "Avvo", url: "https://www.avvo.com", tier: "industry", why: "The dominant lawyer directory; profiles rank for \"<practice area> attorney <city>\"." },
      { key: "findlaw", name: "FindLaw", url: "https://www.findlaw.com", tier: "industry", why: "High-authority legal directory engines cite for lawyer recommendations." },
      { key: "justia", name: "Justia", url: "https://www.justia.com", tier: "industry", why: "Free, high-authority legal listings that reinforce the other two." },
    ],
  },
  {
    match: /dental|dentist|medical|clinic|doctor|physician|chiro|therap|health|dermatolog|pediatric|orthodont/i,
    directories: [
      { key: "healthgrades", name: "Healthgrades", url: "https://www.healthgrades.com", tier: "industry", why: "The most-cited practitioner directory in health searches and AI answers." },
      { key: "zocdoc", name: "Zocdoc", url: "https://www.zocdoc.com", tier: "industry", why: "Booking-first directory whose profiles rank for \"<speciality> near me\"." },
    ],
  },
  {
    match: /restaurant|cafe|coffee|catering|bakery|bar\b|food|pizzeria|diner/i,
    directories: [
      { key: "tripadvisor", name: "Tripadvisor", url: "https://www.tripadvisor.com/Owners", tier: "industry", why: "Heavily cited for anywhere-to-eat questions, by travellers and AI assistants alike." },
      { key: "opentable", name: "OpenTable", url: "https://restaurant.opentable.com", tier: "industry", why: "Reservation-first directory that ranks for dining searches in most cities." },
    ],
  },
  {
    match: /auto|car repair|mechanic|tire|transmission|detail|body shop|oil change/i,
    directories: [
      { key: "repairpal", name: "RepairPal", url: "https://repairpal.com", tier: "industry", why: "The certified-shop directory engines cite for repair-cost and shop questions." },
    ],
  },
  {
    match: /real estate|realtor|property management|broker/i,
    directories: [
      { key: "zillow", name: "Zillow", url: "https://www.zillow.com", tier: "industry", why: "Where property searches actually happen; agent profiles rank on their own." },
      { key: "realtor-com", name: "Realtor.com", url: "https://www.realtor.com", tier: "industry", why: "The industry's own portal, cross-referenced by engines for agent legitimacy." },
    ],
  },
  {
    match: /salon|spa|barber|nail|lash|massage|tattoo/i,
    directories: [
      { key: "booksy", name: "Booksy", url: "https://booksy.com/biz", tier: "industry", why: "Booking directory whose profiles rank for beauty-service searches." },
    ],
  },
];

/**
 * The directories worth this business's time: the six core profiles
 * always, the matching industry pack when one matches, and the short
 * general tail. Order is the order of expected impact.
 */
export function directoriesFor(industry: string, services = ""): Directory[] {
  const core: Directory[] = CORE_LOCAL_CITATIONS.map((name) => {
    const d = CORE_DETAILS[name];
    return { key: d.key, name, url: d.url, tier: "core" as const, why: d.why };
  });
  const haystack = `${industry} ${services}`;
  const pack = INDUSTRY_PACKS.find((p) => p.match.test(haystack))?.directories ?? [];
  return [...core, ...pack, ...GENERAL];
}

/* ------------------------------ the NAP pack ------------------------------ */

export type NapField = {
  /** The label a directory form would use. */
  label: string;
  value: string;
};

export type NapPack = {
  fields: NapField[];
  /** Every field joined, for the copy-everything button. */
  all: string;
};

/**
 * The canonical strings to paste into every listing, byte for byte.
 *
 * Assembled from real business data only — the description is the same
 * kind of factual sentence the rebuild and the schema generator produce,
 * never marketing invention. A field with no value behind it is omitted
 * entirely rather than filled with something plausible: an invented
 * suite number would make every listing that copies it wrong together.
 */
export function buildNapPack(input: {
  businessName: string;
  phone: string;
  address: string;
  city: string;
  region: string;
  websiteUrl: string;
  industry: string;
  services: string[];
  serviceArea: string;
}): NapPack {
  const name = input.businessName.trim();
  const fields: NapField[] = [];

  if (name) fields.push({ label: "Business name", value: name });
  if (input.phone.trim()) fields.push({ label: "Phone", value: input.phone.trim() });
  const addr = [input.address.trim(), input.city.trim(), input.region.trim()]
    .filter(Boolean)
    .join(", ");
  if (addr) fields.push({ label: "Address", value: addr });
  if (input.websiteUrl.trim()) fields.push({ label: "Website", value: input.websiteUrl.trim() });
  if (input.industry.trim()) fields.push({ label: "Category", value: input.industry.trim() });

  const services = input.services.map((s) => s.trim()).filter(Boolean);
  if (services.length) fields.push({ label: "Services", value: services.join(", ") });
  if (input.serviceArea.trim()) fields.push({ label: "Service area", value: input.serviceArea.trim() });

  if (name && (input.industry.trim() || services.length)) {
    const what = input.industry.trim() || services.slice(0, 3).join(", ");
    const where = input.city.trim()
      ? ` in ${input.city.trim()}${input.region.trim() ? `, ${input.region.trim()}` : ""}`
      : "";
    const extra = services.length && input.industry.trim()
      ? ` Services include ${services.slice(0, 4).join(", ")}.`
      : "";
    fields.push({
      label: "Description",
      value: `${name} provides ${what.toLowerCase()}${where}.${extra}`,
    });
  }

  return {
    fields,
    all: fields.map((f) => `${f.label}: ${f.value}`).join("\n"),
  };
}

/* ------------------------------ status model ------------------------------ */

export type CitationStatus = "todo" | "submitted" | "live";

export const CITATION_STATUSES: { value: CitationStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "submitted", label: "Submitted" },
  { value: "live", label: "Live" },
];
