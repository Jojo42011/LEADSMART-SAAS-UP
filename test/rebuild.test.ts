/**
 * The rebuilt homepage generator.
 *
 * The severe rule under test is REAL DATA ONLY. This page publishes to a
 * customer's domain under their business's name, so a fabricated claim
 * here isn't our lie, it's theirs — a five-star review nobody wrote or a
 * "licensed and insured" nobody verified would be the product putting
 * words in a real business's mouth. The builder must therefore render
 * sections strictly from supplied facts, and render nothing at all where
 * a fact is absent.
 */
import { buildHomepage, type RebuildInput } from "../src/lib/engine/rebuild";

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(ok ? "PASS" : "FAIL", n, extra); if (!ok) fails++; };

const full: RebuildInput = {
  businessName: "Acme Pools",
  industry: "custom pool construction",
  city: "Scottsdale",
  region: "AZ",
  serviceArea: "Scottsdale, Paradise Valley",
  phone: "(480) 555 0184",
  address: "4280 N Scottsdale Rd",
  services: ["pool building", "pool remodeling", "outdoor kitchens"],
  locations: ["Scottsdale", "Tempe"],
  siteUrl: "https://acmepools.example",
  description: "Acme Pools designs and builds custom pools across the Valley.",
  logo: "https://acmepools.example/logo.png",
  colors: ["#0a7d55"],
  nav: [
    { label: "Gallery", href: "/gallery" },
    { label: "Contact", href: "/contact" },
  ],
};

/* ------------------------------ the full page ---------------------------- */
const page = buildHomepage(full);
check("title carries the business and place", /Acme Pools/.test(page.title) && /Scottsdale/.test(page.title), page.title);
check("meta description is a true assembled sentence",
  /Acme Pools/.test(page.metaDescription) && /custom pool construction/.test(page.metaDescription),
  page.metaDescription);
check("meta description fits the SERP limit", page.metaDescription.length <= 158);
check("every service renders", ["Pool Building", "Pool Remodeling", "Outdoor Kitchens"].every((s) => page.html.includes(s)));
check("locations render", page.html.includes("Tempe"));
check("the real phone is the CTA", page.html.includes("tel:+") === false && page.html.includes('tel:4805550184'));
check("the brand accent is applied", page.html.includes("#0a7d55"));
check("the real logo is used", page.html.includes("logo.png"));
check("the site's own navigation survives", page.html.includes(">Gallery<") && page.html.includes('href="/gallery"'));
check("canonical points at the customer's origin", page.html.includes('href="https://acmepools.example/"'));
check("full snippet eligibility is granted", page.html.includes("max-snippet:-1"));
check("LocalBusiness schema is embedded", page.html.includes('"@type":"LocalBusiness"'));

/* -------------------------- real data only ------------------------------- */
// Nothing the input did not assert. These are the claims a template is
// most tempted to invent because they convert well.
// \breviews?\b, both boundaries: "max-image-preview" ends in "review",
// and the first run of this test flagged the robots meta tag as a
// fabricated testimonial.
const forbidden = [/licensed/i, /insured/i, /★/, /5-star/i, /five.star/i, /testimonial/i, /\breviews?\b/i, /award/i, /#1\b/, /\bbest\b/i, /guarantee/i];
check("no fabricated trust claims anywhere",
  forbidden.every((re) => !re.test(page.html)),
  forbidden.filter((re) => re.test(page.html)).map(String).join(", "));

/* ------------------------- absent facts, absent sections ------------------ */
const bare = buildHomepage({
  businessName: "Bare Co",
  industry: "",
  city: "",
  region: "",
  serviceArea: "",
  phone: "",
  address: "",
  services: [],
  locations: [],
  siteUrl: "https://bare.example",
});
check("no services section without services", !bare.html.includes('id="services"'));
check("no service-area section without locations", !bare.html.includes('id="areas"'));
check("no tel: link without a phone", !bare.html.includes("tel:"));
check("no logo tag without a logo", !bare.html.includes("<img"));
check("a bare page still renders a complete document",
  bare.html.includes("<!doctype html>") && bare.html.includes("</html>"));
check("hero falls back to the business name", bare.html.includes("Bare Co"));

/* ------------------------------ escaping --------------------------------- */
const hostile = buildHomepage({
  ...full,
  businessName: 'Acme "Pools" <script>alert(1)</script>',
  services: ['pool building</div><script>x</script>'],
});
check("markup in the business name cannot execute", !hostile.html.includes("<script>alert(1)</script>"));
check("markup in a service cannot execute", !hostile.html.includes("<script>x</script>"));
const blob = hostile.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
check("the schema blob cannot be broken out of", !blob.includes("</script>"));

/* -------------------------- accent hygiene ------------------------------- */
check("a near-white palette is not used as the accent",
  !buildHomepage({ ...full, colors: ["#ffffff", "#fefefe"] }).html.includes("--accent:#ffffff"));
check("a usable colour further down the list is found",
  buildHomepage({ ...full, colors: ["#ffffff", "#2244aa"] }).html.includes("--accent:#2244aa"));

process.exit(fails);
