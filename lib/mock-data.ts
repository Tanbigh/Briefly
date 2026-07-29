import type { Article, WeatherSnapshot } from "./types";

export const MOCK_ARTICLES: Article[] = [
  {
    id: "1",
    slug: "rbi-holds-repo-rate-steady",
    headline: "RBI Holds Repo Rate Steady at 6.5% Amid Easing Inflation",
    headlineBn: "মুদ্রাস্ফীতি কমার প্রেক্ষাপটে রেপো রেট ৬.৫ শতাংশে অপরিবর্তিত রাখল আরবিআই",
    takeaway: "RBI kept its key interest rate unchanged for the third straight review.",
    takeawayBn: "টানা তৃতীয়বার সুদের হার অপরিবর্তিত রাখল রিজার্ভ ব্যাংক।",
    summaryEn: [
      "The Reserve Bank of India's Monetary Policy Committee kept the repo rate unchanged at 6.5% on Wednesday, citing a steady decline in retail inflation over the past two quarters.",
      "Governor Sanjay Malhotra said the committee would continue to watch food price trends before considering any rate cut, adding that growth projections for the current fiscal year remain intact at 7.2%.",
      "Market analysts said the decision was widely expected and should keep borrowing costs stable for home and auto loans in the near term."
    ],
    summaryBn: [
      "গত দুই প্রান্তিক ধরে খুচরা মুদ্রাস্ফীতি ধারাবাহিকভাবে কমতে থাকার কথা জানিয়ে বুধবার রেপো রেট ৬.৫ শতাংশে অপরিবর্তিত রাখল রিজার্ভ ব্যাংক অফ ইন্ডিয়ার আর্থিক নীতি নির্ধারণী কমিটি।",
      "গভর্নর সঞ্জয় মালহোত্রা জানান, সুদের হার কমানোর আগে খাদ্যপণ্যের দামের প্রবণতার উপর নজর রাখবে কমিটি। চলতি অর্থবছরে বৃদ্ধির পূর্বাভাস ৭.২ শতাংশেই অক্ষত রাখা হয়েছে বলে তিনি জানান।",
      "বাজার বিশ্লেষকদের মতে এই সিদ্ধান্ত প্রত্যাশিতই ছিল, এবং আপাতত গৃহঋণ ও গাড়ি ঋণের সুদের হার স্থিতিশীল থাকবে বলে ধারণা করা হচ্ছে।"
    ],
    category: "Economy",
    source: "PIB",
    sourceUrl: "https://pib.gov.in",
    imageUrl: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    readingTimeSeconds: 35,
    isBreaking: false,
    isTrending: true,
    tags: ["RBI", "Sanjay Malhotra", "Repo Rate", "India"]
  },
  {
    id: "2",
    slug: "supreme-court-verdict-electoral-bonds",
    headline: "Supreme Court Delivers Landmark Verdict on Electoral Transparency Law",
    headlineBn: "নির্বাচনী স্বচ্ছতা আইন নিয়ে সুপ্রিম কোর্টের যুগান্তকারী রায়",
    takeaway: "The Supreme Court ruled the disclosure provisions must apply retroactively.",
    takeawayBn: "প্রকাশ সংক্রান্ত ধারাগুলি পূর্ববর্তী সময় থেকেও প্রযোজ্য হবে বলে জানাল সুপ্রিম কোর্ট।",
    summaryEn: [
      "A five-judge Constitution Bench of the Supreme Court ruled Tuesday that political funding disclosure requirements must apply retroactively, a decision expected to affect thousands of past filings.",
      "Chief Justice of India led the bench in holding that voters have a fundamental right to know the source of political funding, reaffirming an earlier 2024 ruling on the subject.",
      "The Election Commission has been directed to publish a compliance report within eight weeks."
    ],
    summaryBn: [
      "মঙ্গলবার সুপ্রিম কোর্টের পাঁচ বিচারপতির সংবিধান বেঞ্চ রায় দেয় যে, রাজনৈতিক অর্থায়ন প্রকাশের নিয়ম পূর্ববর্তী সময় থেকেও কার্যকর হবে। এই সিদ্ধান্তে হাজার হাজার পুরনো নথি প্রভাবিত হতে পারে।",
      "ভারতের প্রধান বিচারপতির নেতৃত্বাধীন বেঞ্চ জানায়, রাজনৈতিক অর্থায়নের উৎস জানার অধিকার ভোটারদের মৌলিক অধিকারের অন্তর্ভুক্ত, যা ২০২৪ সালের পূর্ববর্তী রায়কেই পুনর্নিশ্চিত করে।",
      "নির্বাচন কমিশনকে আট সপ্তাহের মধ্যে একটি সম্মতি প্রতিবেদন প্রকাশের নির্দেশ দেওয়া হয়েছে।"
    ],
    category: "Breaking News",
    source: "PIB",
    sourceUrl: "https://pib.gov.in",
    imageUrl: "https://images.unsplash.com/photo-1589578228447-e1a4e481c6c8?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    readingTimeSeconds: 38,
    isBreaking: true,
    isTrending: true,
    tags: ["Supreme Court", "Election Commission", "India"]
  },
  {
    id: "3",
    slug: "india-clinches-series-thriller",
    headline: "India Clinch Series with Last-Over Thriller Against Australia",
    headlineBn: "শেষ ওভারের রুদ্ধশ্বাস লড়াইয়ে অস্ট্রেলিয়ার বিরুদ্ধে সিরিজ জয় ভারতের",
    takeaway: "India won by 3 wickets off the final ball to seal the series 3-2.",
    takeawayBn: "শেষ বলে ৩ উইকেটে জিতে সিরিজ ৩-২ ব্যবধানে নিশ্চিত করল ভারত।",
    summaryEn: [
      "India sealed the five-match T20 series 3-2 with a nerve-wracking three-wicket win over Australia in Ahmedabad on Sunday, chasing down 187 off the final ball.",
      "An unbeaten 68 off 41 balls anchored the chase after India slipped to 96 for 5 in the 13th over.",
      "The win extends India's unbeaten home run in T20 series to eleven, with the next assignment being a Test series against South Africa next month."
    ],
    summaryBn: [
      "রবিবার আহমেদাবাদে অস্ট্রেলিয়ার বিরুদ্ধে শেষ বলে ৩ উইকেটের রুদ্ধশ্বাস জয়ে পাঁচ ম্যাচের টি-টোয়েন্টি সিরিজ ৩-২ ব্যবধানে নিশ্চিত করল ভারত। ১৮৭ রানের লক্ষ্য তাড়া করে জয় ছিনিয়ে নেয় তারা।",
      "১৩তম ওভারে ৯৬ রানে ৫ উইকেট হারানোর পর ৪১ বলে অপরাজিত ৬৮ রানের ইনিংস দলের রান তাড়ায় মূল ভরসা হয়ে ওঠে।",
      "এই জয়ে ঘরের মাঠে টানা এগারোটি টি-টোয়েন্টি সিরিজে অপরাজিত রইল ভারত। আগামী মাসে দক্ষিণ আফ্রিকার বিরুদ্ধে টেস্ট সিরিজ তাদের পরবর্তী চ্যালেঞ্জ।"
    ],
    category: "Cricket",
    source: "AP",
    sourceUrl: "https://apnews.com",
    imageUrl: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    readingTimeSeconds: 32,
    isBreaking: false,
    isTrending: true,
    tags: ["Cricket", "India", "Australia", "T20"]
  },
  {
    id: "4",
    slug: "new-ai-chip-architecture",
    headline: "Chipmakers Unveil Next-Generation AI Accelerator Architecture",
    headlineBn: "পরবর্তী প্রজন্মের এআই চিপ স্থাপত্য উন্মোচন করল প্রযুক্তি সংস্থাগুলি",
    takeaway: "The new chip architecture promises triple the efficiency for AI training.",
    takeawayBn: "নতুন চিপ স্থাপত্তি এআই প্রশিক্ষণে তিনগুণ দক্ষতার প্রতিশ্রুতি দিচ্ছে।",
    summaryEn: [
      "Two major semiconductor firms jointly announced a new AI accelerator architecture on Monday, claiming up to three times the training efficiency of current-generation chips.",
      "The companies said the design focuses on memory bandwidth improvements rather than raw transistor count, addressing a key bottleneck in large model training.",
      "Commercial availability is expected in the second half of next year, with early access for select cloud partners starting this quarter."
    ],
    summaryBn: [
      "সোমবার দুটি প্রধান সেমিকন্ডাক্টর সংস্থা যৌথভাবে একটি নতুন এআই অ্যাক্সিলারেটর স্থাপত্য ঘোষণা করেছে, যা বর্তমান প্রজন্মের চিপের তুলনায় তিনগুণ পর্যন্ত প্রশিক্ষণ দক্ষতা দেওয়ার দাবি করছে।",
      "সংস্থাগুলি জানিয়েছে, স্থূল ট্রানজিস্টর সংখ্যা বাড়ানোর পরিবর্তে মেমরি ব্যান্ডউইডথ উন্নত করার দিকে জোর দেওয়া হয়েছে, যা বড় মডেল প্রশিক্ষণের একটি বড় বাধা দূর করবে।",
      "আগামী বছরের দ্বিতীয়ার্ধে এটি বাণিজ্যিকভাবে পাওয়া যাবে বলে আশা করা হচ্ছে, এবং চলতি প্রান্তিক থেকেই নির্বাচিত ক্লাউড অংশীদাররা আগাম সুযোগ পাবে।"
    ],
    category: "Artificial Intelligence",
    source: "Reuters",
    sourceUrl: "https://reuters.com",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    readingTimeSeconds: 34,
    isBreaking: false,
    isTrending: false,
    tags: ["AI", "Semiconductors", "Technology"]
  },
  {
    id: "5",
    slug: "cyclone-warning-bay-of-bengal",
    headline: "Cyclone Warning Issued for Coastal Odisha and West Bengal",
    headlineBn: "উপকূলীয় ওড়িশা ও পশ্চিমবঙ্গের জন্য ঘূর্ণিঝড় সতর্কতা জারি",
    takeaway: "IMD warns of a cyclonic storm making landfall within 48 hours.",
    takeawayBn: "৪৮ ঘণ্টার মধ্যে ঘূর্ণিঝড় স্থলভাগে আছড়ে পড়তে পারে বলে জানাল আইএমডি।",
    summaryEn: [
      "The India Meteorological Department issued an orange alert for coastal Odisha and West Bengal on Wednesday, warning of a cyclonic storm expected to make landfall within 48 hours.",
      "Wind speeds of up to 100 kilometers per hour are forecast near the coast, with heavy rainfall expected across five districts.",
      "State disaster response teams have begun evacuating low-lying fishing villages as a precaution."
    ],
    summaryBn: [
      "বুধবার ভারতীয় আবহাওয়া দফতর উপকূলীয় ওড়িশা ও পশ্চিমবঙ্গের জন্য কমলা সতর্কতা জারি করেছে, আগামী ৪৮ ঘণ্টার মধ্যে একটি ঘূর্ণিঝড় স্থলভাগে আছড়ে পড়তে পারে বলে সতর্ক করা হয়েছে।",
      "উপকূল সংলগ্ন এলাকায় ঘণ্টায় ১০০ কিলোমিটার পর্যন্ত বেগে ঝোড়ো হাওয়া বইতে পারে, এবং পাঁচটি জেলায় ভারী বৃষ্টিপাতের পূর্বাভাস দেওয়া হয়েছে।",
      "সতর্কতামূলক ব্যবস্থা হিসেবে নিচু উপকূলীয় মৎস্যজীবী গ্রামগুলি থেকে বাসিন্দাদের সরিয়ে নেওয়ার কাজ শুরু করেছে রাজ্যের দুর্যোগ মোকাবিলা দল।"
    ],
    category: "Weather",
    source: "DD News",
    sourceUrl: "https://ddnews.gov.in",
    imageUrl: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    readingTimeSeconds: 33,
    isBreaking: true,
    isTrending: false,
    tags: ["Cyclone", "IMD", "Odisha", "West Bengal"]
  },
  {
    id: "6",
    slug: "global-plastics-treaty-talks",
    headline: "Nations Reconvene for Final Round of Global Plastics Treaty Talks",
    headlineBn: "বিশ্বব্যাপী প্লাস্টিক চুক্তি নিয়ে চূড়ান্ত দফার আলোচনায় বসল রাষ্ট্রগুলি",
    takeaway: "Negotiators aim to finalize binding plastic production limits this week.",
    takeawayBn: "এই সপ্তাহেই প্লাস্টিক উৎপাদনের বাধ্যতামূলক সীমা চূড়ান্ত করার লক্ষ্য আলোচকদের।",
    summaryEn: [
      "Delegates from more than 170 countries began the final scheduled round of talks in Geneva on Monday, aiming to agree on binding limits on global plastic production.",
      "Sticking points remain over whether the treaty should cap production outright or focus only on waste management and recycling.",
      "A senior UN environment official said a deal remains within reach but would likely require sessions running past the official deadline."
    ],
    summaryBn: [
      "সোমবার জেনেভায় ১৭০টিরও বেশি দেশের প্রতিনিধিরা চূড়ান্ত নির্ধারিত দফার আলোচনা শুরু করেন, যার লক্ষ্য বিশ্বব্যাপী প্লাস্টিক উৎপাদনের উপর বাধ্যতামূলক সীমা নির্ধারণ।",
      "চুক্তিতে সরাসরি উৎপাদন সীমিত করা হবে, নাকি শুধু বর্জ্য ব্যবস্থাপনা ও পুনর্ব্যবহারের উপর জোর দেওয়া হবে, তা নিয়ে মতপার্থক্য এখনও রয়ে গেছে।",
      "জাতিসংঘের এক জ্যেষ্ঠ পরিবেশ কর্মকর্তা জানান, নির্ধারিত সময়সীমা পেরিয়ে গেলেও চুক্তি সম্পন্ন হওয়ার সম্ভাবনা এখনও রয়েছে।"
    ],
    category: "Environment",
    source: "Reuters",
    sourceUrl: "https://reuters.com",
    imageUrl: "https://images.unsplash.com/photo-1621451537084-482c73073a0f?q=80&w=1600&auto=format&fit=crop",
    publishedAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    readingTimeSeconds: 36,
    isBreaking: false,
    isTrending: false,
    tags: ["Plastics Treaty", "United Nations", "Environment"]
  }
];

// fix the accidental placeholder above defensively at import time
MOCK_ARTICLES.forEach((a) => {
  if (!a.imageUrl || !a.imageUrl.startsWith("http")) {
    a.imageUrl = "https://images.unsplash.com/photo-1495020689067-958852a7765e?q=80&w=1600&auto=format&fit=crop";
  }
});

export const MOCK_WEATHER: WeatherSnapshot[] = [
  { location: "Kolkata", temperatureC: 31, condition: "Partly Cloudy", humidityPercent: 78, windKph: 14 },
  { location: "Durgapur", temperatureC: 32, condition: "Light Rain", humidityPercent: 82, windKph: 18, alert: "Heavy rainfall alert for the next 24 hours" },
  { location: "New Delhi", temperatureC: 34, condition: "Hazy Sunshine", humidityPercent: 55, windKph: 9 },
  { location: "Mumbai", temperatureC: 29, condition: "Monsoon Showers", humidityPercent: 88, windKph: 22 }
];

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
