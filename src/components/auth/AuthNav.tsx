"use client";

import { PillNav } from "@/components/auth/PillNav";

const NAV_ITEMS = [
  { href: "/", label: "\u9996\u9875" },
  { href: "/login", label: "\u767b\u5f55" },
  { href: "/register", label: "\u6ce8\u518c" },
] as const;

export function AuthNav() {
  return (
    <PillNav
      items={NAV_ITEMS.map((item) => ({
        ...item,
        ariaLabel: item.label,
      }))}
      baseColor="#000000"
      pillColor="#ffffff"
      hoveredPillTextColor="#ffffff"
      pillTextColor="#000000"
      ease="power2.easeOut"
      initialLoadAnimation={false}
    />
  );
}
