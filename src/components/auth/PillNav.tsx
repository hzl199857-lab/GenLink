"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

import styles from "./PillNav.module.css";

export type PillNavItem = {
  label: string;
  href: string;
  ariaLabel?: string;
  onClick?: () => void;
};

export interface PillNavProps {
  items: PillNavItem[];
  activeHref?: string;
  className?: string;
  ease?: string;
  baseColor?: string;
  pillColor?: string;
  hoveredPillTextColor?: string;
  pillTextColor?: string;
  initialLoadAnimation?: boolean;
}

export function PillNav({
  items,
  activeHref,
  className = "",
  ease = "power3.easeOut",
  baseColor = "#fff",
  pillColor = "#120F17",
  hoveredPillTextColor = "#120F17",
  pillTextColor,
  initialLoadAnimation = true,
}: PillNavProps) {
  const resolvedPillTextColor = pillTextColor ?? baseColor;
  const circleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const navItemsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layout = () => {
      circleRefs.current.forEach((circle) => {
        if (!circle?.parentElement) {
          return;
        }

        const pill = circle.parentElement as HTMLElement;
        const rect = pill.getBoundingClientRect();
        const { width: w, height: h } = rect;
        const radius = ((w * w) / 4 + h * h) / (2 * h);
        const diameter = Math.ceil(2 * radius) + 2;
        const delta =
          Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (w * w) / 4))) + 1;
        const originY = diameter - delta;

        circle.style.width = `${diameter}px`;
        circle.style.height = `${diameter}px`;
        circle.style.bottom = `-${delta}px`;
        circle.style.transformOrigin = `50% ${originY}px`;
      });
    };

    layout();

    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(layout).catch(() => {});

    if (initialLoadAnimation && navItemsRef.current) {
      gsap.set(navItemsRef.current, { width: 0, overflow: "hidden" });
      gsap.to(navItemsRef.current, {
        width: "auto",
        duration: 0.6,
        ease,
      });
    }

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [ease, initialLoadAnimation, items]);

  const cssVars = {
    "--base": baseColor,
    "--pill-bg": pillColor,
    "--hover-text": hoveredPillTextColor,
    "--pill-text": resolvedPillTextColor,
  } as CSSProperties;

  return (
    <div className={styles.pillNavContainer}>
      <nav
        className={`${styles.pillNav} ${className}`}
        aria-label={"\u4e3b\u5bfc\u822a"}
        style={cssVars}
      >
        <div className={styles.pillNavItems} ref={navItemsRef}>
          <ul className={styles.pillList} role="menubar">
            {items.map((item, index) => (
              <li key={item.href} role="none">
                <a
                  role="menuitem"
                  href={item.href}
                  className={`${styles.pill} ${
                    activeHref === item.href ? styles.isActive : ""
                  }`}
                  aria-label={item.ariaLabel || item.label}
                  onClick={item.onClick}
                >
                  <span
                    className={styles.hoverCircle}
                    aria-hidden="true"
                    ref={(element) => {
                      circleRefs.current[index] = element;
                    }}
                  />
                  <span className={styles.labelStack}>
                    <span className={styles.pillLabel}>{item.label}</span>
                    <span className={styles.pillLabelHover} aria-hidden="true">
                      {item.label}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
