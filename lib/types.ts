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
}

export interface WeatherSnapshot {
  location: string;
  temperatureC: number;
  condition: string;
  humidityPercent: number;
  windKph: number;
  alert?: string;
}
