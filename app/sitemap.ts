import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p === "/" ? "" : p}`,
    lastModified: now,
    changeFrequency: p === "/" ? "weekly" : "monthly",
    priority: p === "/" ? 1 : p === "/pricing" ? 0.8 : 0.3,
  }));
}
