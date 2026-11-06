import { NextResponse } from "next/server";
import { HIGHLIGHT_SCHEMA, HIGHLIGHT_SYSTEM, validateHighlights, type HighlightFacts } from "@/business/highlights";
import { createHash } from "node:crypto";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_BODY = 200_000;
const CACHE_MS = 12 * 60 * 60 * 1000;
// The same week's facts get the same highlights: call Gemini once, not on every page load.
const cache = ((globalThis as unknown as { __frHighlights?: Map<string, { at: number; body: unknown }> }).__frHighlights ??= new Map());

/** Gemini writes trends and highlights from facts the rules engine already calculated. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false, error: "Too much data." }, { status: 413 });
  let facts: HighlightFacts | null = null;
  try {
    facts = JSON.parse(raw) as HighlightFacts;
  } catch {
    /* handled below */
  }
  if (!facts?.skus || !Array.isArray(facts.skus) || facts.skus.length > 1000) return NextResponse.json({ ok: false, error: "Missing analysis facts." }, { status: 400 });
  const cacheKey = createHash("sha256").update(raw).digest("hex");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.body);
  const key = env.geminiKey();
  if (!key) return NextResponse.json({ ok: false, configured: false, error: "Gemini is not configured (GEMINI_API_KEY)." });

  const prompt = `Facts for ${facts.week}:\n${JSON.stringify(facts)}`;
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/${encodeURIComponent(env.geminiModel())}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: HIGHLIGHT_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt + feedback }] }],
          generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: HIGHLIGHT_SCHEMA },
        }),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
      if (!res.ok) return NextResponse.json({ ok: false, configured: true, error: `Gemini returned ${res.status}.` });
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = (body.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
      const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, ""));
      const { highlights, dropped } = validateHighlights(parsed, facts);
      if (highlights.length >= 2) {
        const out = { ok: true, configured: true, model: env.geminiModel(), highlights, dropped };
        if (cache.size > 200) cache.clear();
        cache.set(cacheKey, { at: Date.now(), body: out });
        return NextResponse.json(out);
      }
      feedback = "\n\nYour previous answer used numbers or SKU codes not in the facts. Use only the facts as given.";
    } catch {
      feedback = "\n\nReply with JSON only, matching the schema.";
    }
  }
  return NextResponse.json({ ok: false, configured: true, error: "Gemini's highlights did not match the calculated facts. Showing rule-generated highlights." });
}
