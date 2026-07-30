export type Category =
  | "Breaking News"
  | "India"
  | "World"
  | "Politics"
  | "Government"
  | "Economy"
  | "Business"
  | "Technology"
  | "Artificial Intelligence"
  | "Science"
  | "Education"
  | "Health"
  | "Weather"
  | "Cricket"
  | "Sports"
  | "Entertainment"
  | "Environment";

/**
 * How useful a story is for competitive-exam prep (UPSC, WBCS, SSC,
 * Banking, Railway, State PSC, etc). Set by the AI pipeline (see
 * lib/ai.ts) based on the fixed priority-topic list Briefly is built
 * around — government schemes/policy, Parliament & Bills, judgments,
 * economy/RBI/SEBI, international relations, defence, ISRO/DRDO,
 * environment, appointments, reports & indices, elections, and so on.
 * "Low" is the deliberate bucket for celebrity/lifestyle/viral content
 * that isn't nationally significant — it's never fabricated as anything
 * higher just because a story exists.
 */
export type ExamRelevance = "High" | "Medium" | "Low";

export interface Article {
  id: string;
  slug: string;
  headline: string;
  headlineBn: string;
  takeaway: string; // AI Brief, English, max 20 words
  takeawayBn: string; // AI Brief, Bengali, max 20 words
  summaryEn: string[]; // 2-5 short paragraphs
  summaryBn: string[]; // 2-5 short paragraphs, natural Bengali
  category: Category;
  source: string;
  sourceUrl: string;
  imageUrl: string | null;
  imageCredit?: string;
  publishedAt: string; // ISO timestamp
  readingTimeSeconds: number;
  isBreaking: boolean;
  isTrending: boolean;
  tags: string[]; // people, orgs, locations for search

  // --- Exam-prep fields (see lib/ai.ts for how these are generated) ---
  examRelevance: ExamRelevance;
  /** 0-100. Drives the default article ordering (see lib/data.ts), not just publish time. */
  importanceScore: number;
  /** Short factual bullets (numbers, names, figures) pulled only from the source input — never invented. */
  keyFacts: string[];
  /** Dates explicitly present in the source input, if any. Empty array if none were given. */
  importantDates: string[];
  /** 1-2 sentences on why this matters for exam prep / national significance. */
  whyItMatters: string;
  /** A short "Prelims Fact" or "Possible Exam Question" nugget. Omitted for stories too trivial to warrant one. */
  prelimsFact?: string;
}

export interface WeatherSnapshot {
  location: string;
  temperatureC: number;
  condition: string;
  humidityPercent: number;
  windKph: number;
  alert?: string;
}