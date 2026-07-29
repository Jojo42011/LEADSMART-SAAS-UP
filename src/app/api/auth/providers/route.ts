import { NextResponse } from "next/server";
import { storeConfigured } from "@/lib/engine/store";

/**
 * Which sign-in methods this deployment has configured. The auth screen
 * reads this to show working buttons and to flag anything that still needs
 * credentials, instead of guessing. `password` requires the database:
 * email accounts have nowhere to live without it.
 */
export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    password: storeConfigured(),
  });
}
