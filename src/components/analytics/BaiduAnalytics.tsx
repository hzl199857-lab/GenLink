"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BAIDU_ANALYTICS_HOSTNAME } from "@/lib/analytics/baidu";

declare global {
  interface Window {
    _hmt?: Array<unknown[]>;
  }
}

export function BaiduAnalytics() {
  const pathname = usePathname();
  const isInitialPage = useRef(true);

  useEffect(() => {
    if (isInitialPage.current) {
      isInitialPage.current = false;
      return;
    }

    if (window.location.hostname !== BAIDU_ANALYTICS_HOSTNAME) return;

    window._hmt = window._hmt || [];
    window._hmt.push(["_trackPageview", pathname]);
  }, [pathname]);

  return null;
}
