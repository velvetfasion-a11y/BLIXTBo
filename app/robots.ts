import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/hjalp",
        "/guider",
        "/villkor",
        "/integritet",
        "/favicon.ico",
        "/favicon-48x48.png",
        "/favicon-96x96.png",
        "/favicon-192x192.png",
        "/icon-192.png",
        "/icon-512.png",
        "/logo.png",
        "/icon.svg",
        "/apple-touch-icon.png",
        "/manifest.webmanifest",
      ],
      disallow: [...PRIVATE_PATHS],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
