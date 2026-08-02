import { secretsMatch } from "../src/lib/api-auth";

/**
 * Constant-time secret comparison.
 *
 * The timing property itself is not directly assertable in a unit test —
 * measuring it reliably needs statistics and a quiet machine, and a flaky
 * timing assertion is worse than none. What IS assertable, and what
 * actually goes wrong when someone "optimises" this later, is the
 * correctness around the edges: a hashed comparison must still accept the
 * right secret, must reject on length differences without throwing (
 * timingSafeEqual throws on unequal buffers, which is why both sides are
 * hashed first), and must never treat empty or missing values as a match.
 */

let fails = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(ok ? "PASS" : "FAIL", n, extra);
  if (!ok) fails++;
};

const SECRET = "Bearer 9f2c1e77-aaaa-bbbb-cccc-1234567890ab";

check("accepts the exact secret", secretsMatch(SECRET, SECRET));
check("rejects a different secret of the same length",
  !secretsMatch(SECRET, SECRET.slice(0, -1) + "z"));
check("rejects a correct prefix (the timing-attack shape)",
  !secretsMatch("Bearer 9f2c1e77", SECRET));
// Different lengths must return false, not throw: timingSafeEqual raises
// on unequal buffer lengths, and letting that escape would turn a wrong
// guess into a 500 and leak the length.
let threw = false;
try {
  check("rejects a much shorter value without throwing", !secretsMatch("x", SECRET));
  check("rejects a much longer value without throwing", !secretsMatch(SECRET + "aaaaaaaaaa", SECRET));
} catch {
  threw = true;
}
check("length mismatch does not throw", !threw);
check("rejects empty against empty", !secretsMatch("", ""));
check("rejects null header", !secretsMatch(null, SECRET));
check("rejects undefined config", !secretsMatch(SECRET, undefined));
check("is case sensitive", !secretsMatch(SECRET.toUpperCase(), SECRET));
check("does not trim whitespace", !secretsMatch(` ${SECRET}`, SECRET));

if (fails > 0) process.exitCode = 1;
