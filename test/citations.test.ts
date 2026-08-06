/**
 * The citations catalog and the NAP pack.
 *
 * The catalog is a set of claims — "a listing here moves local
 * visibility for this business" — so the tests hold it to the shape
 * those claims need: the core six always and first, industry packs only
 * for the industries they match, no duplicates, every link https, every
 * row carrying its reason. The pack is held to the same real-data rule
 * as everything that writes on a customer's behalf: absent facts are
 * omitted, never invented — an invented suite number would make every
 * listing that copies it wrong together.
 */
import { directoriesFor, buildNapPack } from "../src/lib/citations";
import { CORE_LOCAL_CITATIONS } from "../src/lib/geo";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

/* -------------------------------- catalog -------------------------------- */
const pool = directoriesFor("Custom pool construction", "pool building, pool remodeling");
check("the core six are always present",
  CORE_LOCAL_CITATIONS.every((name) => pool.some((d) => d.name === name)));
check("...and come first, in impact order",
  pool.slice(0, CORE_LOCAL_CITATIONS.length).every((d) => d.tier === "core"));
check("a pool builder gets the home-services pack",
  ["Angi", "Thumbtack", "Houzz"].every((n) => pool.some((d) => d.name === n)));
check("no duplicate keys", new Set(pool.map((d) => d.key)).size === pool.length);
check("every link is https", pool.every((d) => d.url.startsWith("https://")));
check("every row says why it is on the list", pool.every((d) => d.why.length > 30));

const lawyer = directoriesFor("Family law", "divorce, custody");
check("an attorney gets the legal pack, not the plumbing one",
  lawyer.some((d) => d.name === "Avvo") && !lawyer.some((d) => d.name === "Angi"));

const dentist = directoriesFor("Dental clinic", "");
check("a dentist gets the health pack", dentist.some((d) => d.name === "Healthgrades"));

const unknown = directoriesFor("Quantum yak grooming", "");
check("an unmatched industry gets core + general only, no wrong pack",
  unknown.every((d) => d.tier !== "industry"));
check("...which still leaves a useful list", unknown.length >= CORE_LOCAL_CITATIONS.length + 1);

// The industry match reads services too: an owner who typed the trade
// into services but left industry vague still gets their pack.
const viaServices = directoriesFor("Local business", "emergency plumbing, drain cleaning");
check("the pack matches on services when industry is vague",
  viaServices.some((d) => d.name === "Angi"));

/* -------------------------------- NAP pack -------------------------------- */
const full = buildNapPack({
  businessName: "Acme Pools",
  phone: "(480) 555 0184",
  address: "4280 N Scottsdale Rd",
  city: "Scottsdale",
  region: "AZ",
  websiteUrl: "https://acmepools.example",
  industry: "Custom pool construction",
  services: ["pool building", "pool remodeling"],
  serviceArea: "Scottsdale, Paradise Valley",
});
const get = (label: string) => full.fields.find((f) => f.label === label)?.value ?? "";
check("name, phone, website carried verbatim",
  get("Business name") === "Acme Pools" &&
  get("Phone") === "(480) 555 0184" &&
  get("Website") === "https://acmepools.example");
check("address assembles street, city, region",
  get("Address") === "4280 N Scottsdale Rd, Scottsdale, AZ", get("Address"));
check("description is a true assembled sentence",
  /^Acme Pools provides custom pool construction in Scottsdale, AZ\./.test(get("Description")),
  get("Description"));
check("the copy-all block carries every field",
  full.fields.every((f) => full.all.includes(f.value)));

const sparse = buildNapPack({
  businessName: "Bare Co",
  phone: "",
  address: "",
  city: "",
  region: "",
  websiteUrl: "https://bare.example",
  industry: "",
  services: [],
  serviceArea: "",
});
check("absent facts are omitted, never invented",
  sparse.fields.every((f) => ["Business name", "Website"].includes(f.label)),
  sparse.fields.map((f) => f.label).join(","));
check("no description without something true to say",
  !sparse.fields.some((f) => f.label === "Description"));

process.exit(fails);
