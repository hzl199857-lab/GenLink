"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const BAIDU_ANALYTICS_SITE_ID = "e4c7b42c302d857de6a10ca93c6541f2";
const PRODUCTION_HOSTNAME = "genlink.zerinnai.online";

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

    if (window.location.hostname !== PRODUCTION_HOSTNAME) return;

    window._hmt = window._hmt || [];
    window._hmt.push(["_trackPageview", pathname]);
  }, [pathname]);

  return (
    <Script id="baidu-analytics" strategy="afterInteractive">
      {`
        if (window.location.hostname === "${PRODUCTION_HOSTNAME}") {
          window._hmt = window._hmt || [];
          (function() {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?${BAIDU_ANALYTICS_SITE_ID}";
            var s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(hm, s);
          })();
        }
      `}
    </Script>
  );
}
