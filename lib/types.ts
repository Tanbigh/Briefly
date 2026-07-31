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
 * How useful an article is for competitive-exam current affairs
 * (UPSC / WBCS / SSC / Banking / Railway / State PSC), as judged by the
 * AI pipeline (see lib/ai.ts). "High" = directly syllabus/GK relevant
 * (schemes, Bills, judgments, RBI/SEBI/Budget, appointments, ISRO/DRDO,
 * reports & indexes, etc). "Low" = general-interest or entertainment
 * with no governance/economy/science/international angle — these are
 * filtered out of the public site by lib/data.ts unless independently
 * newsworthy (breaking, or corroborated by several trusted sources).
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

  // --- Competitive-exam current-affairs fields (see lib/ai.ts) ---
  /** High/Medium/Low usefulness for UPSC/WBCS/SSC/Banking/Railway/State PSC prep. */
  examRelevance: ExamRelevance;
  /** 0-100 internal ranking score the AI assigns for overall national/international
   *  significance + exam utility. Used by lib/data.ts to rank articles by importance
   *  rather than only by recency. Not necessarily meant to be displayed verbatim. */
  importanceScore: number;
  /** Short, concrete, exam-revision-style facts pulled ONLY from the source
   *  input — numbers, names, figures, statistics. Never fabricated. */
  keyFacts: string[];
  /** Government bodies, ministries, courts, companies, or international
   *  organizations mentioned (e.g. "RBI", "Supreme Court of India", "ISRO", "WHO"). */
  organizations: string[];
  /** Explicit dates/timelines mentioned in the source (e.g. "5 August 2026"). */
  importantDates: string[];
  /** One or two sentences on why this matters for exam prep — which
   *  syllabus area/paper it's relevant to and what makes it significant. */
  whyItMatters: string;
  /** A short, fact-grounded possible prelims-style question, when the
   *  input supports one. Omitted (empty string) when the source is too
   *  thin to responsibly generate a question from. */
  possibleExamQuestion?: string;
  /** 2-5 short bullet points formatted for quick revision — a condensed,
   *  scannable subset of keyFacts. Optional: not every low/medium-relevance
   *  article needs this. */
  prelimsFacts?: string[];
}

export interface WeatherSnapshot {
  location: string;
  temperatureC: number;
  condition: string;
  humidityPercent: number;
  windKph: number;
  alert?: string;
}