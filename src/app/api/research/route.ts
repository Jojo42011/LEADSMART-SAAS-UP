import { NextRequest, NextResponse } from "next/server";
import { runResearch, type ResearchInput } from "@/lib/engine/research";

/** Thin HTTP wrapper; the engine core lives in src/lib/engine/research.ts. */
export async function POST(req: NextRequest) {
  let input: ResearchInput;
  try {
    input = (await req.json()) as ResearchInput;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  return NextResponse.json(await runResearch(input));
}
