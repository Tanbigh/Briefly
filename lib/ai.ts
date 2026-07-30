import Anthropic from "@anthropic-ai/sdk";
import type { Category } from "./types";

/**
 * Briefly's AI pipeline.
 *
 * This module is the only place in the codebase that talks to the model.
 * Every function here is deliberately narrow (one job each) so the
 * automatic pipeline in scripts/fetch-news.ts stays easy to audit for
 * copyright safety: we only ever send the model a headline + a short
 * publisher-provided description, never a full scraped article body.
 */

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = "claude-sonnet-4-6";

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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }]
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  const cleaned = text.replace(/^```json/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

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


