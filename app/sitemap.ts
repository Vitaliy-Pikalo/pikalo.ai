import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://pikalo.org", changeFrequency: "monthly", priority: 1 },
    { url: "https://pikalo.org/check", changeFrequency: "yearly", priority: 0.8 },
  ];
}
