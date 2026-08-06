import { detectClientRendered } from "../src/lib/site-ingest";

/**
 * Detecting a site whose content only exists after JavaScript runs.
 *
 * Vercel and MERJ tracked 500M+ GPTBot fetches and found zero JavaScript
 * execution; ClaudeBot downloads JS in ~24% of requests and never runs
 * it. Googlebot is the exception, so a client-rendered site can rank
 * perfectly well on Google while being invisible to every AI answer
 * engine — and the owner has no reason to suspect it, because their
 * Google rankings look fine.
 *
 * The test is weighted toward false positives rather than false
 * negatives, because that is the expensive direction. Telling an owner
 * their site is invisible to AI search when it is not is alarming, hard
 * for them to disprove, and would undermine every other number we show
 * them. Missing one costs a warning we could have given.
 */

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

const expect = (name: string, html: string, want: boolean) => {
  const r = detectClientRendered(html);
  check(name, r.clientRendered === want, `clientRendered=${r.clientRendered} chars=${r.textChars}`);
};

const prose = "Desert Pools AZ builds custom pools in Mesa and Scottsdale. ".repeat(20);

// --- Shells that must be flagged ---------------------------------------
expect(
  "create-react-app shell",
  `<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  true
);
expect("Vue shell", `<html><body><div id="app"></div><script src="/app.js"></script></body></html>`, true);
expect(
  "unhydrated Next.js shell",
  `<html><body><div id="__next"></div><script src="/_next/x.js"></script></body></html>`,
  true
);
expect("Nuxt shell", `<html><body><div id="__nuxt"></div></body></html>`, true);

// --- Sites that must NOT be flagged ------------------------------------
// The important case: SSR frameworks use the same mount point, with the
// content already inside it. Matching on the id alone would flag every
// server-rendered Next.js site in existence.
expect(
  "server-rendered Next.js, content inside the mount",
  `<html><body><div id="__next"><h1>Desert Pools</h1><p>${prose}</p></div></body></html>`,
  false
);
expect(
  "ordinary WordPress page",
  `<html><body><header><nav><a href="/">Home</a></nav></header><main><h1>Pools</h1><p>${prose}</p></main></body></html>`,
  false
);
expect(
  "thin but genuinely server-rendered page",
  `<html><body><h1>Coming soon</h1><p>We build pools in Mesa. Call 555-0100.</p></body></html>`,
  false
);
expect(
  "SPA mount that also ships real content",
  `<html><body><div id="root"><h1>Pools</h1><p>${prose}</p></div></body></html>`,
  false
);
expect(
  "large inline script alongside real copy",
  `<html><body><script>${"var x=1;".repeat(500)}</script><main><p>${prose}</p></main></body></html>`,
  false
);
expect(
  "an empty div that is not a framework mount point",
  `<html><body><div id="banner"></div><p>${prose}</p></body></html>`,
  false
);

// Script and style content must not be counted as visible text — a shell
// with a megabyte of inline bundle would otherwise look content-rich.
const shellWithBigScript = `<html><body><div id="root"></div><script>${"a".repeat(5000)}</script></body></html>`;
check(
  "script bodies are not counted as page text",
  detectClientRendered(shellWithBigScript).textChars < 600,
  `chars=${detectClientRendered(shellWithBigScript).textChars}`
);
expect("shell with a large inline bundle is still a shell", shellWithBigScript, true);

if (fails > 0) process.exitCode = 1;
