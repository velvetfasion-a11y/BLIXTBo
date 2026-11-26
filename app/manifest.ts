import type { MetadataRoute } from "next";
import { HOME_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blixtbo",
    short_name: "Blixtbo",
    description: HOME_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "sv",
    background_color: "#F3F0EA",
    theme_color: "#F3F0EA",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
