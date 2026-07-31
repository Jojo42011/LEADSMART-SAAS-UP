import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { geminiCall, geminiConfigured, geminiModel, listGeminiModels } from "@/lib/gemini";
import { probeStore, storeConfigured, listSitesForEmail, getConnection } from "@/lib/engine/store";

/**
 * Answers "why isn't the agent publishing?" with facts instead of guesswork.
 *
 * Every dependency the cycle needs can fail quietly: a Gemini key that is
 * present but rejected, a model name this project cannot call, a missing
 * publish connection, an unset CRON_SECRET that stops the schedule. Each of
 * those ends the same way — a thin page held below the quality gate — so
 * this checks them individually and reports the real error for each.
 *
 * The Gemini check performs a real (tiny) generation, because a key can
 * look configured and still be refused.
 */
export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (auth.response) return auth.response;

  const checks: Record<string, unknown> = {};

  // Environment presence. Values are never returned, only whether they exist.
  checks.env = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    GITHUB_CLIENT_ID: Boolean(process.env.GITHUB_CLIENT_ID),
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
  };

  // A real call: the only way to distinguish "key set" from "key works".
  if (!geminiConfigured()) {
    checks.gemini = {
      ok: false,
      model: geminiModel(),
      error: "GEMINI_API_KEY is not set — pages fall back to the built-in template and score below the publish gate.",
    };
  } else {
    const probe = await geminiCall("Reply with the single word: ready", {
      temperature: 0,
      maxOutputTokens: 16,
    });
    checks.gemini = {
      ok: probe.error === null,
      // geminiModel() reports the model actually in use, which may differ
      // from the configured one after an automatic deprecation fallback.
      model: geminiModel(),
      reply: probe.text?.trim().slice(0, 60) ?? null,
      error: probe.error,
    };
    // When generation fails, the single most useful next fact is which
    // models this key may call — that turns "404" into a name to set.
    if (probe.error) {
      const available = await listGeminiModels();
      checks.geminiAvailableModels = available.error ?? available.models;
    }
  }

  // A real `select 1`, not just an env-var presence check. A wrong password
  // is indistinguishable from healthy if all you test is that the string
  // exists.
  checks.database = await probeStore();

  if (storeConfigured()) {
    try {
      const sites = await listSitesForEmail(auth.user.email);
      checks.sites = await Promise.all(
        sites.map(async (site) => {
          const conn = await getConnection(site.id);
          const canPublish =
            site.platform === "wordpress"
              ? Boolean(conn?.wp_user && conn.wp_app_password)
              : Boolean(conn?.github_repo && conn.github_token);
          return {
            url: site.url,
            platform: site.platform,
            cadence: site.cadence,
            publishMode: site.publish_mode,
            lastRunAt: site.last_run_at,
            canPublish,
            publishBlockedBy: canPublish
              ? null
              : `No ${site.platform} credentials stored for this site — reconnect publishing in onboarding.`,
            reviewModeHolds:
              site.publish_mode === "review"
                ? "Publish mode is Review, so pages wait for approval instead of going live."
                : null,
          };
        })
      );
      if (sites.length === 0) {
        checks.sites = [];
        checks.sitesNote =
          "No site is registered with the engine for this account. Complete onboarding while signed in so the agent has something to work on.";
      }
    } catch (e) {
      checks.sitesError = e instanceof Error ? e.message : "could not read sites";
    }
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), checks });
}
