import { NextRequest, NextResponse } from "next/server";
import { runResearch, type ResearchInput } from "@/lib/engine/research";
import { requireSession } from "@/lib/api-auth";

/**
 * Thin HTTP wrapper; the engine core lives in src/lib/engine/research.ts.
 * Sign-in required: every call spends Gemini quota on our key. The wizard
 * treats a failure here as non-fatal and completes onboarding regardless.
 */
export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  let input: ResearchInput;
  try {
    input = (await req.json()) as ResearchInput;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  return NextResponse.json(await runResearch(input));
}
