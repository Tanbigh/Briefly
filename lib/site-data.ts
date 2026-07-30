import type { WeatherSnapshot } from "./types";

/**
 * Fixed category taxonomy the AI pipeline classifies every article into
 * (see lib/ai.ts). Static site structure, not news content — unaffected
 * by the removal of mock articles.
 */
export const CATEGORY_LIST = [
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
] as const;

/**
 * Placeholder content for the /weather page. This was never part of the
 * RSS/AI news pipeline and is out of scope for the "remove the database"
 * refactor — it's static UI content, not a demo standing in for live
 * articles. If live weather is wanted later, it would be its own small
 * fetch (e.g. a public weather API) with its own short revalidate window,
 * same pattern as lib/data.ts.
 */
export const WEATHER_SNAPSHOTS: WeatherSnapshot[] = [
  { location: "Kolkata", temperatureC: 31, condition: "Partly Cloudy", humidityPercent: 78, windKph: 14 },
  { location: "Durgapur", temperatureC: 32, condition: "Light Rain", humidityPercent: 82, windKph: 18, alert: "Heavy rainfall alert for the next 24 hours" },
  { location: "New Delhi", temperatureC: 34, condition: "Hazy Sunshine", humidityPercent: 55, windKph: 9 },
  { location: "Mumbai", temperatureC: 29, condition: "Monsoon Showers", humidityPercent: 88, windKph: 22 }
];
