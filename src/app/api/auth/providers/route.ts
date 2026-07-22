import { NextResponse } from "next/server";

/**
 * Which single sign-on providers this deployment has configured. The auth
 * screen reads this to show working SSO buttons and to flag any provider
 * that still needs credentials, instead of guessing.
 */
export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  });
}
