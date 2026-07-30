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
 * -------------------------------------------------------------------
 * AUDIENCE: Briefly is a current-affairs platform for competitive-exam
 * aspirants (UPSC, WBCS, SSC, Banking, Railway, State PSC, etc), not a
 * general news app. The system prompt below asks the model to grade every
 * story for exam relevance and importance, and to pull out the kind of
 * structured facts an aspirant would actually want (key facts, dates,
 * why it matters, a prelims-style takeaway) — see GeneratedArticle below.
 * -------------------------------------------------------------------
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

const EXAM_RELEVANCE_LEVELS: ExamRelevance[] = ["High", "Medium", "Low"];

// The fixed set of topic areas Briefly's aspirant audience actually cares
// about. This is fed straight into the system prompt so the model grades
// exam relevance/importance against a concrete list instead of a vague
// "is this important" judgment call.
const PRIORITY_TOPICS = [
  "Government schemes and policies",
  "Parliament and Bills",
  "Supreme Court and High Court judgments",
  "Economy, RBI, SEBI, Budget, Banking",
  "International relations and diplomacy",
  "Defence and military exercises",
  "Science, Space, ISRO, DRDO",
  "Environment and Climate",
  "Awards and Honours",
  "Important appointments and resignations",
  "Reports and Indexes (e.g. rankings, indices published by government/international bodies)",
  "Education and government recruitment",
  "Election Commission updates",
  "Important sports events and records (only major/record-setting ones, not routine match coverage)",
  "Major disasters and humanitarian events",
  "Technology and AI developments",
  "Health and WHO updates"
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

  // --- Exam-prep fields ---
  examRelevance: ExamRelevance;
  importanceScore: number; // 0-100
  keyFacts: string[];
  importantDates: string[];
  whyItMatters: string;
  prelimsFact?: string;
}

/**
 * Turns a raw feed item into a full bilingual Briefly article, graded and
 * annotated for competitive-exam relevance.
 * One model call, structured JSON output, strict grounding rules.
 */
export async function generateArticle(item: RawItem): Promise<GeneratedArticle> {
  const system = `You are the automated news desk for Briefly, a bilingual (English/Bengali) current-affairs
briefing platform built specifically for competitive-exam aspirants — UPSC, WBCS, SSC, Banking,
Railway, State PSC, and similar government exams. You are NOT a general news desk: your job is to
help someone studying for these exams quickly get the facts they actually need, not to entertain.

Rules you must always follow:
- You are given only a headline and a short public description/dek of a news item, never a full article body.
- Never invent facts, quotes, numbers, dates, or names that are not present in the input.
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

EXAM RELEVANCE — this is the most important judgment you make. Grade every story against this fixed
list of high-value topic areas for these exams:
${PRIORITY_TOPICS.map((t) => `  - ${t}`).join("\n")}

- "examRelevance": one of "High", "Medium", "Low".
  - "High": directly matches one of the priority topic areas above and is nationally/internationally
    significant (e.g. a new government scheme, a Bill passed, a Supreme Court judgment, an RBI/SEBI policy
    move, an ISRO/DRDO milestone, a major appointment, an international summit outcome, a disaster with
    national response, a WHO declaration).
  - "Medium": loosely touches a priority topic area, or is state/local-level rather than national, or is
    a minor/update-only version of an already-known development.
  - "Low": celebrity gossip, movie/entertainment news, lifestyle content, viral/trivia stories, routine
    (non-record-setting) match reports, or anything with no real bearing on these exams. Grade honestly as
    "Low" even if you are given an entertainment story — do not inflate its relevance just because it exists.
- "importanceScore": an integer 0-100 reflecting overall national/exam significance (not just how
  "interesting" the story is). As a rough guide: 80-100 for major national/international developments
  (constitutional, policy, judgment, economy, defence, diplomacy, disaster with wide impact), 50-79 for
  solid but narrower stories (a single scheme launch, a single appointment, a state-level policy), 20-49
  for minor updates or routine coverage, 0-19 for low-value/entertainment/trivia content. This score is
  used to rank the homepage, so be honest and consistent rather than generous.
- "keyFacts": 3-6 short factual bullet strings (figures, names, institutions, numbers) taken ONLY from the
  input — never invented. Use an empty array if the input genuinely doesn't contain enough concrete detail.
- "importantDates": any specific dates explicitly present in the input (e.g. "launched on 15 July 2026",
  "the Bill was passed on..."). Use an empty array if none are given — never guess a date.
- "whyItMatters": one or two sentences explaining, specifically, why an exam aspirant should know this —
  e.g. what body/scheme/policy it relates to, what precedent or trend it reflects.
- "prelimsFact": a short, exam-style nugget — either a "Prelims Fact" (a crisp, memorable fact framed the
  way a prelims MCQ option might state it) or a "Possible Exam Question" (a single plausible question this
  news could inspire). Base it strictly on facts present in the input. Omit this field (empty string) for
  stories too trivial or thin to warrant one — don't force it for low-value content.

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
  "importantDates": string[],
  "whyItMatters": string,
  "prelimsFact": string
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

  const importanceScoreRaw = Number(parsed.importanceScore);
  const importanceScore = Number.isFinite(importanceScoreRaw)
    ? Math.max(0, Math.min(100, Math.round(importanceScoreRaw)))
    : 50; // neutral fallback if the model omitted/mangled this — never silently 0, which would bury the story

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
    examRelevance: EXAM_RELEVANCE_LEVELS.includes(parsed.examRelevance) ? parsed.examRelevance : "Medium",
    importanceScore,
    keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
    importantDates: Array.isArray(parsed.importantDates) ? parsed.importantDates : [],
    whyItMatters: typeof parsed.whyItMatters === "string" ? parsed.whyItMatters : "",
    prelimsFact: typeof parsed.prelimsFact === "string" && parsed.prelimsFact.trim() ? parsed.prelimsFact : undefined
  };
}