import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/store/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/types/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "gl-app": "#08090B",
        "gl-canvas": "#0B0C0E",
        "gl-canvas-elevated": "#101113",
        "gl-panel": "#15171A",
        "gl-panel-soft": "#181A1E",
        "gl-panel-hover": "#1E2024",
        "gl-panel-active": "#25282D",
        "gl-stroke-subtle": "rgba(255,255,255,0.06)",
        "gl-stroke-soft": "rgba(255,255,255,0.10)",
        "gl-stroke-medium": "rgba(255,255,255,0.16)",
        "gl-stroke-strong": "rgba(255,255,255,0.24)",
        "gl-text-primary": "rgba(245,247,250,0.96)",
        "gl-text-secondary": "rgba(214,219,227,0.72)",
        "gl-text-tertiary": "rgba(184,192,204,0.52)",
        "gl-text-muted": "rgba(154,163,177,0.38)",
        "gl-accent-cool": "#7AA2FF",
        "gl-accent-cool-soft": "rgba(122,162,255,0.18)",
        "gl-accent-cyan": "#62D0FF",
        "gl-accent-violet": "#8D7DFF",
        "gl-success": "#43C27A",
        "gl-warning": "#E9A23B",
        "gl-error": "#E56B6F",
      },
      borderRadius: {
        "gl-xs": "8px",
        "gl-sm": "10px",
        "gl-md": "14px",
        "gl-lg": "18px",
        "gl-xl": "22px",
        "gl-pill": "999px",
      },
      boxShadow: {
        "gl-card": "0 8px 24px rgba(0,0,0,0.28)",
        "gl-cardHover": "0 10px 28px rgba(0,0,0,0.32)",
        "gl-cardSelected": "0 12px 34px rgba(0,0,0,0.36)",
        "gl-toolbar": "0 6px 18px rgba(0,0,0,0.24)",
        "gl-glow":
          "0 0 0 1px rgba(122,162,255,0.22), 0 0 0 6px rgba(122,162,255,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
