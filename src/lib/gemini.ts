/**
 * Server side Gemini wrapper. Uses Google Search grounding for research
 * calls so competitor and keyword data comes from live results, not model
 * memory. Everything degrades gracefully when GEMINI_API_KEY is absent:
 * callers get null and fall back to deterministic logic.
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

type GeminiOptions = {
  system?: string;
  useSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, error: "GEMINI_API_KEY is not set" };

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
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
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
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
        error: `Gemini returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""} (model ${MODEL})`,
      };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) {
      const finish = json.candidates?.[0]?.finishReason;
      return { text: null, error: `Gemini returned no text${finish ? ` (finishReason ${finish})` : ""}` };
    }
    return { text, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return { text: null, error: `Gemini request failed: ${message} (model ${MODEL})` };
  }
}

/** Text-only wrapper for callers that do not need the failure reason. */
export async function gemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  return (await geminiCall(prompt, opts)).text;
}

/** The model this deployment will call, for diagnostics. */
export function geminiModel(): string {
  return MODEL;
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
