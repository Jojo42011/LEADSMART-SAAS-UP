/**
 * Server side Gemini wrapper. Uses Google Search grounding for research
 * calls so competitor and keyword data comes from live results, not model
 * memory. Everything degrades gracefully when GEMINI_API_KEY is absent:
 * callers get null and fall back to deterministic logic.
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Preference order used when the configured model is retired.
 *
 * Google deprecates model IDs on its own schedule, and the failure is a 404
 * on every generation call — which the agent experienced as "every page
 * falls back to the template and is held below the quality gate", with
 * nothing in the UI pointing at the cause. Rather than pin a name that will
 * expire again, ask Google which models this key can actually call and pick
 * the best available match. Resolution is cached for the process lifetime,
 * so this costs one extra request after a deprecation, not one per call.
 */
const MODEL_PREFERENCE = [/flash-latest/, /2\.5-flash/, /flash/, /pro/];

let resolvedModel: string | null = null;
let resolving: Promise<string | null> | null = null;

export async function listGeminiModels(): Promise<{ models: string[]; error: string | null }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { models: [], error: "GEMINI_API_KEY is not set" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { models: [], error: `ListModels returned ${res.status}` };
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const models = (json.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    return { models, error: null };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : "ListModels failed" };
  }
}

/** Best callable model for this key, or null if none can be discovered. */
async function discoverModel(): Promise<string | null> {
  const { models } = await listGeminiModels();
  if (models.length === 0) return null;
  for (const pattern of MODEL_PREFERENCE) {
    const match = models.find((m) => pattern.test(m) && !/vision|embedding|aqa/.test(m));
    if (match) return match;
  }
  return models[0] ?? null;
}

function activeModel(): string {
  return resolvedModel ?? MODEL;
}

type GeminiOptions = {
  system?: string;
  useSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Tokens the model may spend on internal reasoning before writing.
   *
   * The 2.5-generation models think first, and that thinking is drawn from
   * the same maxOutputTokens budget as the visible answer — so a small cap
   * yields finishReason MAX_TOKENS with no text at all, and a generous one
   * still loses however much thinking consumed. 0 disables it, which is
   * right for short mechanical calls; leave unset to let the model decide.
   */
  thinkingBudget?: number;
};

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type GeminiResult = {
  text: string | null;
  /**
   * Why the call produced nothing, in words a human can act on. Null on
   * success. Every failure used to collapse to a bare null, so a wrong
   * model name, a rejected key and an exhausted quota were impossible to
   * tell apart — the agent quietly shipped template content instead.
   */
  error: string | null;
};

export async function geminiCall(prompt: string, opts: GeminiOptions = {}): Promise<GeminiResult> {
  const first = await attempt(prompt, opts, activeModel());
  // A 404 means the model ID is gone, not that the request was bad. Discover
  // a live one and retry once; every later call reuses the resolved name.
  if (first.status !== 404) return { text: first.text, error: first.error };

  if (!resolving) resolving = discoverModel().finally(() => { resolving = null; });
  const discovered = await resolving;
  if (!discovered || discovered === activeModel()) {
    return {
      text: null,
      error: `${first.error}. No replacement model was available to this API key${
        discovered ? "" : " (could not list models)"
      }.`,
    };
  }
  resolvedModel = discovered;
  const retry = await attempt(prompt, opts, discovered);
  return { text: retry.text, error: retry.error };
}

type Attempt = GeminiResult & { status: number | null };

async function attempt(prompt: string, opts: GeminiOptions, model: string): Promise<Attempt> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, error: "GEMINI_API_KEY is not set", status: null };

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(opts.thinkingBudget === undefined
        ? {}
        : { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }),
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  if (opts.useSearch) {
    body.tools = [{ google_search: {} }];
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      }
    );
    if (!res.ok) {
      // Google puts a usable reason in the body; surface it verbatim rather
      // than reducing every failure to "it did not work".
      let detail = "";
      try {
        const body = (await res.json()) as { error?: { message?: string; status?: string } };
        detail = body.error?.message || body.error?.status || "";
      } catch {
        detail = await res.text().catch(() => "");
      }
      return {
        text: null,
        error: `Gemini returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""} (model ${model})`,
        status: res.status,
      };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const finish = json.candidates?.[0]?.finishReason;
    if (!text) {
      return {
        text: null,
        error: `Gemini returned no text${finish ? ` (finishReason ${finish})` : ""}${
          finish === "MAX_TOKENS"
            ? " — the model spent its whole output budget on internal reasoning. Raise maxOutputTokens or set thinkingBudget: 0."
            : ""
        }`,
        status: res.status,
      };
    }
    // A page cut off mid-sentence is not a usable draft, and returning it as
    // one would ship a half-written article that reads as thin content. Say
    // it was truncated so the caller can hold it rather than publish it.
    if (finish === "MAX_TOKENS") {
      return { text, error: "Gemini truncated the response at the token limit", status: res.status };
    }
    return { text, error: null, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return { text: null, error: `Gemini request failed: ${message} (model ${model})`, status: null };
  }
}

/**
 * Text-only wrapper for callers that do not need the failure reason.
 * Nulls out truncated responses too: every other failure already yields a
 * null text, and handing back half a reply under the same contract would
 * make partial output indistinguishable from complete output.
 */
export async function gemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  const { text, error } = await geminiCall(prompt, opts);
  return error ? null : text;
}

/**
 * The model this deployment will call, for diagnostics. Reports the resolved
 * name once a deprecation fallback has happened, so the report matches what
 * requests actually use rather than what the env var says.
 */
export function geminiModel(): string {
  return activeModel();
}

/** Pulls the first JSON object or array out of a model response. */
export function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  for (let end = cleaned.length; end > start; end--) {
    try {
      return JSON.parse(cleaned.slice(start, end)) as T;
    } catch {
      // keep shrinking until the JSON parses
    }
  }
  return null;
}
