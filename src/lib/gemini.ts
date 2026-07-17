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

export async function gemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

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
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return text || null;
  } catch {
    return null;
  }
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
