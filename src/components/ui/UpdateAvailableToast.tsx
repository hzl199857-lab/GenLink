"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VERSION_ENDPOINT = "/api/app-version";
const CHECK_INTERVAL_MS = 60_000;
const CURRENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? null;

type VersionResponse = {
  version?: string;
};

async function fetchAppVersion(signal?: AbortSignal) {
  const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) return null;

  const data = (await response.json()) as VersionResponse;
  return typeof data.version === "string" && data.version.length > 0
    ? data.version
    : null;
}

export function UpdateAvailableToast() {
  const currentVersionRef = useRef<string | null>(CURRENT_APP_VERSION);
  const latestVersionRef = useRef<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const checkForUpdate = async () => {
      if (document.visibilityState === "hidden" || isVisible) return;

      try {
        const latestVersion = await fetchAppVersion(controller.signal);
        if (!latestVersion) return;
        latestVersionRef.current = latestVersion;

        if (currentVersionRef.current === null) {
          currentVersionRef.current = latestVersion;
          return;
        }

        if (latestVersion !== currentVersionRef.current) {
          setIsVisible(true);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void checkForUpdate();

    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const dismiss = () => {
    currentVersionRef.current = latestVersionRef.current;
    setIsVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl border border-white/10 bg-[#17191d]/95 px-4 py-3 text-sm text-white shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-white">发现新版本</p>
          <p className="mt-0.5 leading-5 text-white/70">刷新页面即可使用最新内容。</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-[#111318] transition hover:bg-white/90 active:scale-[0.98]"
        >
          刷新
        </button>
        <button
          type="button"
          aria-label="关闭更新提示"
          onClick={dismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
