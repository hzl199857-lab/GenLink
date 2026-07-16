"use client";

import Link from "next/link";
import {
  ChevronDown,
  FileText,
  FolderOpen,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface HomeAccountUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface HomeAccountMenuProps {
  user: HomeAccountUser;
  onOpenProjects: () => void;
  onSignOut: () => Promise<void>;
}

function AccountAvatar({
  user,
  size = "small",
}: {
  user: HomeAccountUser;
  size?: "small" | "large";
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const displayName =
    user.name?.trim() || user.email?.split("@")[0] || "GenLink 用户";
  const initial = Array.from(displayName)[0]?.toUpperCase() || "G";
  const sizeClass = size === "large" ? "h-10 w-10 text-sm" : "h-7 w-7 text-xs";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#343434] font-semibold text-white/85 ${sizeClass}`}
      aria-hidden="true"
    >
      {user.image && failedImageUrl !== user.image ? (
        // Authentication providers may return images from domains unknown at build time.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedImageUrl(user.image ?? null)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

const menuItemClass =
  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium text-white/72 transition-colors hover:bg-[#2b2b2b] hover:text-white focus-visible:bg-[#2b2b2b] focus-visible:text-white focus-visible:outline-none";

export function HomeAccountMenu({
  user,
  onOpenProjects,
  onSignOut,
}: HomeAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName =
    user.name?.trim() || user.email?.split("@")[0] || "GenLink 用户";

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    try {
      await onSignOut();
      setOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="fixed right-4 top-4 z-20 sm:right-7 sm:top-7"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="flex h-10 max-w-[210px] items-center gap-2 rounded-[10px] border border-[#363636] bg-[#212121] px-2 pr-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#282828] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#666666]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="home-account-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <AccountAvatar user={user} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/82">
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-white/42 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-[min(288px,calc(100vw-32px))] pt-2">
          <div
            id="home-account-menu"
            role="menu"
            aria-label="用户菜单"
            className="overflow-hidden rounded-lg border border-[#363636] bg-[#212121] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.48)]"
          >
            <div className="flex items-center gap-3 px-2 py-2.5">
              <AccountAvatar user={user} size="large" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/92">
                  {displayName}
                </div>
                {user.email ? (
                  <div className="mt-0.5 truncate text-xs text-white/42">
                    {user.email}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="my-1 h-px bg-[#363636]" />

            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                setOpen(false);
                onOpenProjects();
              }}
            >
              <FolderOpen size={16} className="text-white/48" />
              项目库
            </button>
            <Link
              href="/legal/terms"
              role="menuitem"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              <FileText size={16} className="text-white/48" />
              服务条款
            </Link>
            <Link
              href="/legal/privacy"
              role="menuitem"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              <ShieldCheck size={16} className="text-white/48" />
              隐私政策
            </Link>

            <div className="my-1 h-px bg-[#363636]" />

            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={16} className="text-white/48" />
              {signingOut ? "正在退出..." : "退出登录"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
