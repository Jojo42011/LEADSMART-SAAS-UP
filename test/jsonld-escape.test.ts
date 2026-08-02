import { generatePage } from "../src/lib/engine/generate";

/**
 * JSON-LD embedded in a <script> tag must not be able to close it.
 *
 * JSON.stringify does not escape "<", so a schema value containing
 * "</script>" ended the tag early and everything after it became live
 * markup on the customer's published page. A business name is enough to
 * trigger it, and not every value is typed by the owner — FAQ answers
 * and descriptions are written by the model from ingested competitor
 * pages, so this is a path from a third party's HTML onto a customer's
 * live site.
 *
 * The second half of this file exists because the first fix was wrong.
 * The escape for U+2028/U+2029 was pasted as literal characters, which
 * arrived as ordinary spaces — so it replaced every space in the
 * document with " " and corrupted every schema on every page. It
 * built, it typechecked, and the injection test still passed. Only
 * parsing the emitted JSON and comparing it to the input catches that,
 * which is what "round-trips unchanged" below does.
 */

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

const HOSTILE = `Bob</script><script>alert(1)</script> Pools & "Spas" <b>`;

async function main() {
  const page = await generatePage({
    keyword: "pool installation mesa",
    pageType: "location",
    business: {
      name: HOSTILE,
      phone: "555-0100",
      address: "1 Main St",
      city: "Mesa",
      region: "AZ",
    },
    websiteUrl: "https://example.com",
    industry: "pool installation",
    services: "pool installation",
  });

  const html = page.html;
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  check("at least one JSON-LD block is emitted", blocks.length > 0, `${blocks.length} blocks`);

  // 1. The tag cannot be closed from inside a value.
  check(
    "no raw </script> survives anywhere in the page",
    !/<\/script>\s*<script>/i.test(html) && !html.includes("<script>alert(1)</script>"),
    ""
  );
  check(
    "no raw '<' inside any JSON-LD block",
    blocks.every((m) => !m[1].includes("<")),
    ""
  );

  // 2. Every block is still valid JSON. An escape that breaks parsing
  //    silently destroys the schema the customer is paying for.
  let allParse = true;
  let nameFound = false;
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      const flat = JSON.stringify(parsed);
      if (flat.includes("Bob")) nameFound = true;
    } catch {
      allParse = false;
    }
  }
  check("every JSON-LD block still parses as JSON", allParse);

  // 3. Round-trip: the parsed value must equal what went in. This is the
  //    assertion that catches an over-broad replace — escaping spaces,
  //    say — which leaves valid JSON that means something different.
  const roundTrip = blocks.map((m) => {
    try {
      return JSON.parse(m[1]) as unknown;
    } catch {
      return null;
    }
  });
  const business = roundTrip.find(
    (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && String((v as Record<string, unknown>)["@type"] ?? "").includes("Business")
  );
  check("the business schema is present after parsing", Boolean(business), String(business && business["@type"]));
  if (business) {
    check(
      "the business name round-trips byte-for-byte, spaces intact",
      business.name === HOSTILE,
      JSON.stringify(business.name)?.slice(0, 80)
    );
  }
  check("the hostile name is carried through rather than stripped", nameFound);

  // 4. Nothing anywhere in the emitted page contains a stray
  //    where a space belongs — the exact corruption of the first attempt.
  check(
    "no space was replaced by a line-separator escape",
    !/\\u2028/.test(html) || !/[A-Za-z]\\u2028[A-Za-z]/.test(html),
    ""
  );

  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
