import { GoogleGenAI } from "@google/genai";
import type { Category } from "./types";

/**
 * Briefly's AI pipeline.
 *
 * This module is the only place in the codebase that talks to the model.
 * Every function here is deliberately narrow (one job each) so the
 * automatic pipeline in lib/data.ts stays easy to audit for copyright
 * safety: we only ever send the model a headline + a short
 * publisher-provided description, never a full scraped article body.
 *
 * Model access goes through the official Google Gemini SDK.
 */

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

if (!process.env.GEMINI_API_KEY) {
  // Fail loudly and immediately at module load time instead of letting every
  // single article generation fail later with a vague/misleading SDK error.
  console.error(
    "[briefly:ai] GEMINI_API_KEY is not set. Set it in your environment " +
      "(.env locally, or your deployment platform's environment variables) — " +
      "get a key at https://aistudio.google.com/apikey"
  );
}

const CATEGORIES: Category[] = [
  "Breaking News",
  "India",
  "World",
  "Politics",
  "Government",
  "Economy",
  "Business",
  "Technology",
  "Artificial Intelligence",
  "Science",
  "Education",
  "Health",
  "Weather",
  "Cricket",
  "Sports",
  "Entertainment",
  "Environment"
];

interface RawItem {
  headline: string;
  description: string; // short RSS/API-provided description or dek, NOT full article text
  source: string;
  sourceUrl: string;
  publishedAt: string;
}

export interface GeneratedArticle {
  headline: string;
  headlineBn: string;
  takeaway: string;
  takeawayBn: string;
  summaryEn: string[];
  summaryBn: string[];
  category: Category;
  isBreaking: boolean;
  tags: string[];
}

/**
 * Turns a raw feed item into a full bilingual Briefly article.
 * One model call, structured JSON output, strict grounding rules.
 */
export async function generateArticle(item: RawItem): Promise<GeneratedArticle> {
  const system = `You are the automated news desk for Briefly, a bilingual (English/Bengali) news briefing platform.

Rules you must always follow:
- You are given only a headline and a short public description/dek of a news item, never a full article body.
- Never invent facts, quotes, numbers, or names that are not present in the input.
- If the input is too thin to summarize responsibly, keep the summary short and general rather than fabricating detail.
- Write in a neutral, professional journalism tone. No opinions, no speculation, no exaggeration.
- The English summary must be 2-5 short paragraphs, readable in about 30-40 seconds.
- The Bengali version must NOT be a literal/word-for-word translation. Rewrite it as fluent, natural Bengali
  newspaper prose, the way an experienced Bengali news editor would write it, while preserving every fact,
  name, number, date, quotation, and location exactly.
- The "takeaway" fields are a single punchy sentence, maximum 20 words, capturing the single most important point.
- Choose exactly one category from this fixed list: ${CATEGORIES.join(", ")}.
- isBreaking should be true only for major national/international events (government announcements, election
  results, natural disasters, major resignations, wars, major court judgments, deaths of significant public figures).
- tags should be 3-8 short strings: people, organizations, and locations mentioned, useful for search.

Respond with ONLY a single JSON object, no markdown fences, no commentary, matching this exact shape:
{
  "headline": string,
  "headlineBn": string,
  "takeaway": string,
  "takeawayBn": string,
  "summaryEn": string[],
  "summaryBn": string[],
  "category": string,
  "isBreaking": boolean,
  "tags": string[]
}`;

  const user = `Source: ${item.source}
Published: ${item.publishedAt}
Headline: ${item.headline}
Description: ${item.description}`;

  console.log(`[briefly:ai] calling gemini-2.5-flash for "${item.headline}"`);
  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${system}\n\n${user}`,
    });
  } catch (err) {
    // Distinguish "the API call itself failed" (auth, rate limit, network,
    // bad model id) from "the API responded but gave us unusable JSON"
    // below — these need different fixes and are logged separately so a
    // caller's generic catch block doesn't blur them together.
    const e = err as { message?: string; status?: number; code?: string; name?: string };
    console.error(
      `[briefly:ai] API call FAILED for "${item.headline}": ` +
        `name=${e.name ?? "unknown"} status=${e.status ?? "n/a"} code=${e.code ?? "n/a"} ` +
        `message=${e.message ?? String(err)}`
    );
    throw err;
  }

  const candidateText = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("") ?? "";

  const text = (candidateText || response.text || "").trim();

  if (!text) {
    const finishReason = response.candidates?.[0]?.finishReason ?? "unknown";
    const promptBlockReason = response.promptFeedback?.blockReason ?? "none";
    console.error(
      `[briefly:ai] EMPTY response for "${item.headline}" — ` +
        `finishReason=${finishReason} promptBlockReason=${promptBlockReason}`
    );
    throw new Error(
      `Gemini returned an empty response (finishReason=${finishReason}, promptBlockReason=${promptBlockReason})`
    );
  }

  const cleaned = text.replace(/^```json/i, "").replace(/```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(
      `[briefly:ai] JSON parse FAILED for "${item.headline}" — raw response (first 300 chars): ${cleaned.slice(0, 300)}`
    );
    throw err;
  }

  return {
    headline: parsed.headline,
    headlineBn: parsed.headlineBn,
    takeaway: parsed.takeaway,
    takeawayBn: parsed.takeawayBn,
    summaryEn: parsed.summaryEn,
    summaryBn: parsed.summaryBn,
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "World",
    isBreaking: Boolean(parsed.isBreaking),
    tags: Array.isArray(parsed.tags) ? parsed.tags : []
  };
}
