import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://pikalo.org", changeFrequency: "monthly", priority: 1 },
    { url: "https://pikalo.org/ask", changeFrequency: "monthly", priority: 0.9 },
    { url: "https://pikalo.org/check", changeFrequency: "yearly", priority: 0.8 },
    { url: "https://pikalo.org/fica", changeFrequency: "yearly", priority: 0.8 },
    { url: "https://pikalo.org/roth", changeFrequency: "yearly", priority: 0.8 },
    { url: "https://pikalo.org/traps", changeFrequency: "monthly", priority: 0.7 },
    { url: "https://pikalo.org/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];
}
