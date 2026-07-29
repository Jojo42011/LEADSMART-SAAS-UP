import { NextRequest, NextResponse } from "next/server";
import { generatePage, type GenerateInput } from "@/lib/engine/generate";
import { requireSession } from "@/lib/api-auth";

/**
 * Thin HTTP wrapper; the engine core lives in src/lib/engine/generate.ts.
 * Sign-in required: every call spends Gemini quota on our key.
 */
export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  let input: GenerateInput;
  try {
    input = (await req.json()) as GenerateInput;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!input.keyword || !input.business?.name) {
    return NextResponse.json({ error: "keyword and business required" }, { status: 400 });
  }
  return NextResponse.json(await generatePage(input));
}
