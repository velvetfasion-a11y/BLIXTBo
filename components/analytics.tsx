"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { analyticsEnabled, trackPageView } from "@/lib/analytics";

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC;
    const website = process.env.NEXT_PUBLIC_ANALYTICS_WEBSITE_ID;
    if (!src || !website || document.querySelector("script[data-website-id]")) return;
    const script = document.createElement("script");
    script.defer = true;
    script.src = src;
    script.dataset.websiteId = website;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    trackPageView(pathname || "/");
  }, [pathname]);

  return null;
}
