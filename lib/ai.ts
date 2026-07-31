import { GoogleGenAI } from "@google/genai";
import type { Category, ExamRelevance } from "./types";

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
 *
 * ---------------------------------------------------------------------
 * WHO THIS IS WRITTEN FOR
 * ---------------------------------------------------------------------
 * Briefly is not a general news app — its primary audience is
 * competitive-exam aspirants (UPSC, WBCS, SSC, Banking, Railway, State
 * PSC, and similar). The system prompt below asks Gemini to act as an
 * exam-focused current-affairs editor rather than a generic summarizer:
 * it has to judge exam relevance, extract exam-revision facts, and flag
 * (via a low importanceScore) stories that are just general-interest or
 * entertainment noise with no governance/economy/science/international
 * angle. lib/data.ts uses that score to rank and filter the final list —
 * this file only produces the judgment, it doesn't decide what's shown.
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

// Gemini's free tier caps gemini-2.5-flash at 5 requests/minute (see the
// "generate_content_free_tier_requests" quota in RESOURCE_EXHAUSTED errors).
// lib/data.ts fans out several `generateArticle()` calls concurrently
// (AI_CONCURRENCY), so without a shared throttle those concurrent workers
// blow through the whole minute's quota in the first second and every
// remaining call fails. This module-level queue serializes the *actual*
// outbound Gemini calls with a minimum spacing between them, independent of
// how much concurrency the caller uses. Override via GEMINI_MIN_MS_BETWEEN_CALLS
// if you're on a paid tier with a higher RPM limit.
const MIN_MS_BETWEEN_CALLS = Number(process.env.GEMINI_MIN_MS_BETWEEN_CALLS || 13000); // ~4.6 req/min, safely under the 5 RPM free-tier cap
let callQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const runAfterQueue = callQueue.then(fn);
  // Keep the queue moving forward regardless of success/failure, and always
  // wait the minimum spacing before releasing the next call — this is what
  // actually enforces the requests-per-minute ceiling.
  callQueue = runAfterQueue.then(
    () => sleep(MIN_MS_BETWEEN_CALLS),
    () => sleep(MIN_MS_BETWEEN_CALLS)
  );
  return runAfterQueue;
}

/** Pulls the API's own suggested retry delay (RetryInfo.retryDelay, e.g. "58s") out of a 429 error, if present. */
function extractRetryDelayMs(err: unknown): number | null {
  const message = (err as { message?: string })?.message;
  if (!message) return null;
  try {
    const parsed = JSON.parse(message);
    const details: Array<Record<string, unknown>> = parsed?.error?.details ?? [];
    const retryInfo = details.find((d) => typeof d["@type"] === "string" && (d["@type"] as string).includes("RetryInfo"));
    const delayStr = retryInfo?.retryDelay as string | undefined; // e.g. "58s" or "0s"
    if (!delayStr) return null;
    const seconds = parseFloat(delayStr.replace(/s$/, ""));
    return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
  } catch {
    return null;
  }
}

// --- Retry policy for 429s -------------------------------------------------
//
// The Gemini API's own suggested RetryInfo.retryDelay for an exhausted
// per-minute quota is often 30-60+ seconds. The caller of this module
// (lib/data.ts) now owns its own short, explicit per-refresh time budget
// and treats "this call didn't finish in time" as a normal, expected
// outcome — the story is simply retried on the next refresh cycle. Given
// that, letting a single call sleep for the API's full suggested delay,
// for up to several retries, is pure waste: it can't help the current
// refresh (which has already stopped waiting on it by the time the delay
// elapses), it privately occupies a slot in the shared call queue above
// for minutes, starving every other item in the same refresh, and Vercel's
// serverless functions provide no guarantee that work continues running
// after a response has been sent anyway. So retries here are kept few and
// fast — just enough to absorb a single transient blip — rather than
// mirroring the API's full backoff suggestion.
const MAX_RATE_LIMIT_RETRIES = Number(process.env.GEMINI_MAX_RATE_LIMIT_RETRIES || 1);
const MAX_RATE_LIMIT_RETRY_DELAY_MS = Number(process.env.GEMINI_MAX_RATE_LIMIT_RETRY_DELAY_MS || 3000);

/** Calls Gemini through the shared throttle, retrying rate-limit (429) errors with a small, capped backoff. */
async function callGemini(params: Parameters<typeof ai.models.generateContent>[0], headline: string) {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await throttle(() => ai.models.generateContent(params));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 429 || attempt === MAX_RATE_LIMIT_RETRIES) throw err;

      const suggestedMs = extractRetryDelayMs(err) ?? 2 ** attempt * 1000;
      const delayMs = Math.min(suggestedMs, MAX_RATE_LIMIT_RETRY_DELAY_MS);
      console.warn(
        `[briefly:ai] rate limited for "${headline}" — retrying in ${delayMs}ms ` +
          `(capped from API-suggested ${suggestedMs}ms; attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
      );
      await sleep(delayMs);
    }
  }
  // Unreachable, but keeps TypeScript happy about the return type.
  throw new Error("callGemini: exhausted retries without returning or throwing");
}

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

  // --- Exam-focused fields ---
  examRelevance: ExamRelevance;
  importanceScore: number; // 0-100
  keyFacts: string[];
  organizations: string[];
  importantDates: string[];
  whyItMatters: string;
  possibleExamQuestion: string; // "" when the input is too thin to responsibly generate one
  prelimsFacts: string[];
}

const EXAM_RELEVANCE_VALUES: ExamRelevance[] = ["High", "Medium", "Low"];

/**
 * Turns a raw feed item into a full bilingual, exam-oriented Briefly article.
 * One model call, structured JSON output, strict grounding rules.
 */
export async function generateArticle(item: RawItem): Promise<GeneratedArticle> {
  const system = `You are the automated current-affairs desk for Briefly, a bilingual (English/Bengali)
news briefing platform whose PRIMARY AUDIENCE is competitive-exam aspirants:
UPSC, WBCS, SSC, Banking, Railway, State PSC, and similar government-exam candidates.
You are not writing for a general entertainment-news audience — you are writing for
someone building a current-affairs revision file.

Rules you must always follow:
- You are given only a headline and a short public description/dek of a news item, never a full article body.
- Never invent facts, quotes, numbers, names, dates, or organizations that are not present in the input.
- If the input is too thin to summarize responsibly, keep the summary short and general rather than fabricating detail,
  and leave possibleExamQuestion as an empty string, and keyFacts/organizations/importantDates as short or empty arrays.
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

EXAM-RELEVANCE JUDGMENT (this is the most important part of your job):
Judge how useful this story is for competitive-exam current affairs. High-value topics include:
government schemes and policies; Parliament and Bills; Supreme Court/High Court judgments; economy, RBI, SEBI,
Budget, banking; international relations and diplomacy; defence and military exercises; science, space, ISRO,
DRDO; environment and climate; awards and honours; important appointments and resignations; reports and
indexes (e.g. rankings, indices released by government/international bodies); education and government
recruitment; Election Commission updates; nationally/internationally significant sports events and records;
major disasters and humanitarian events; technology and AI developments; health and WHO updates.
- examRelevance = "High": directly useful for exam prep — squarely one of the topics above, with concrete
  facts (a scheme name, a judgment, a figure, an appointment, an index ranking, etc).
- examRelevance = "Medium": broadly newsworthy and loosely touches one of the topics above, or is significant
  national/international news without a sharp exam-syllabus angle.
- examRelevance = "Low": celebrity gossip, movie/entertainment promotion, lifestyle content, viral/trivial
  stories, routine sports coverage with no record/achievement of national significance, or anything with no
  governance/economy/science/international dimension. Only give a sports or entertainment story High/Medium
  if it is a genuinely notable national/international achievement (e.g. an Olympic medal, a world record, a
  major national award) — routine match results and celebrity news are Low.
- importanceScore: an integer 0-100 reflecting overall national/international significance AND exam utility
  together. Routine/trivial/entertainment stories should score below 20. Genuinely major stories (Budget,
  a Supreme Court constitution-bench judgment, a war, a national election result, a top international summit)
  should score 80+. Use the full range in between for everything else.
- keyFacts: 2-6 short, concrete, exam-revision-style facts drawn ONLY from the input — figures, names, numbers,
  percentages, rankings. Empty array if the input has no such facts.
- organizations: government bodies, ministries, courts, companies, or international organizations explicitly
  named in the input (e.g. "RBI", "Supreme Court of India", "ISRO", "WHO", "Ministry of Finance"). Empty array
  if none are named.
- importantDates: any explicit dates or timelines mentioned in the input (e.g. "5 August 2026"). Empty array
  if none are given — never infer or guess a date that isn't stated.
- whyItMatters: one or two sentences explaining why this matters for exam preparation — which subject/paper
  area it connects to (Polity, Economy, Science & Tech, International Relations, Environment, etc.) and what
  makes it noteworthy. Keep it factual, not motivational fluff.
- possibleExamQuestion: ONE short, fact-grounded, prelims-style question a candidate might realistically be
  asked, built ONLY from facts present in the input (e.g. "Which organization launched X?" / "As per the
  [Report], India's rank improved to what position?"). Leave as an empty string "" if the input doesn't
  contain enough concrete, verifiable fact to responsibly base a question on — never invent details to make
  a question possible.
- prelimsFacts: 2-5 very short bullet-style strings, a condensed, scannable subset/restatement of keyFacts,
  formatted for quick revision. Empty array if keyFacts is empty.

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
  "tags": string[],
  "examRelevance": "High" | "Medium" | "Low",
  "importanceScore": number,
  "keyFacts": string[],
  "organizations": string[],
  "importantDates": string[],
  "whyItMatters": string,
  "possibleExamQuestion": string,
  "prelimsFacts": string[]
}`;

  const user = `Source: ${item.source}
Published: ${item.publishedAt}
Headline: ${item.headline}
Description: ${item.description}`;

  console.log(`[briefly:ai] calling gemini-2.5-flash for "${item.headline}"`);
  let response;
  try {
    response = await callGemini(
      {
        model: "gemini-2.5-flash",
        contents: `${system}\n\n${user}`,
      },
      item.headline
    );
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

  const importanceScore = Number(parsed.importanceScore);

  return {
    headline: parsed.headline,
    headlineBn: parsed.headlineBn,
    takeaway: parsed.takeaway,
    takeawayBn: parsed.takeawayBn,
    summaryEn: parsed.summaryEn,
    summaryBn: parsed.summaryBn,
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "World",
    isBreaking: Boolean(parsed.isBreaking),
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    examRelevance: EXAM_RELEVANCE_VALUES.includes(parsed.examRelevance) ? parsed.examRelevance : "Medium",
    importanceScore: Number.isFinite(importanceScore) ? Math.min(100, Math.max(0, Math.round(importanceScore))) : 40,
    keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
    organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
    importantDates: Array.isArray(parsed.importantDates) ? parsed.importantDates : [],
    whyItMatters: typeof parsed.whyItMatters === "string" ? parsed.whyItMatters : "",
    possibleExamQuestion: typeof parsed.possibleExamQuestion === "string" ? parsed.possibleExamQuestion : "",
    prelimsFacts: Array.isArray(parsed.prelimsFacts) ? parsed.prelimsFacts : []
  };
}