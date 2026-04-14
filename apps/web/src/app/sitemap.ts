import { MetadataRoute } from "next";

const LAST_UPDATED = new Date("2026-04-13");

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://churnq.com";
  return [
    { url: base,                       lastModified: LAST_UPDATED, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/privacy`,          lastModified: LAST_UPDATED, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/terms`,            lastModified: LAST_UPDATED, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/cookie-policy`,    lastModified: LAST_UPDATED, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/sign-in`,          lastModified: LAST_UPDATED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/sign-up`,          lastModified: LAST_UPDATED, changeFrequency: "monthly", priority: 0.6 },
  ];
}
