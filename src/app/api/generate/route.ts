import { NextRequest, NextResponse } from "next/server";
import { generatePage, type GenerateInput } from "@/lib/engine/generate";

/** Thin HTTP wrapper; the engine core lives in src/lib/engine/generate.ts. */
export async function POST(req: NextRequest) {
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
