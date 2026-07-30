import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briefly — Important News, Clearly Explained",
    short_name: "Briefly",
    description: "AI-summarized bilingual news briefings in English and natural Bengali.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFDF8",
    theme_color: "#FFFDF8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
