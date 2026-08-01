import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { geminiCall, geminiConfigured, geminiModel, listGeminiModels } from "@/lib/gemini";
import { probeStore, storeConfigured, listSitesForEmail, getConnection } from "@/lib/engine/store";
import { verifyWordpress } from "@/lib/engine/publish";

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

  // Which code is actually running. Vercel's "Redeploy" button rebuilds the
  // commit of the deployment it was clicked on — not the latest push — so a
  // fix can be on the branch while production still runs the code from
  // before it. This makes that state visible instead of arguable.
  checks.deployment = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 72) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  };

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
    // A plain request on purpose: no thinkingConfig (models that cannot
    // bound their reasoning 400 on it) and a budget roomy enough that the
    // reasoning phase plus the one-word reply always fit. The probe's only
    // job is to prove the key and model work — every extra knob it sets is
    // another way for the health check to fail on a healthy service, which
    // it has now done twice (a 16-token cap, then thinkingBudget: 0).
    const probe = await geminiCall("Reply with the single word: ready", {
      temperature: 0,
      maxOutputTokens: 2048,
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

          // Stored credentials are not working credentials. For WordPress
          // this authenticates against the customer's live site and checks
          // the account may publish pages, so a revoked application
          // password or a site that has since gone behind bot protection
          // is reported here rather than discovered by a failed publish
          // inside a cron run nobody is watching.
          let credentialCheck: { ok: boolean; error?: string; name?: string } | null = null;
          if (canPublish && site.platform === "wordpress" && conn?.wp_user && conn.wp_app_password) {
            credentialCheck = await verifyWordpress({
              site: site.url,
              user: conn.wp_user,
              appPassword: conn.wp_app_password,
            });
          }
          return {
            url: site.url,
            platform: site.platform,
            cadence: site.cadence,
            publishMode: site.publish_mode,
            active: site.active,
            lastRunAt: site.last_run_at,
            canPublish,
            /** Live proof, where the platform allows one cheaply. */
            credentialCheck,
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
