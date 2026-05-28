import type { Config } from "tailwindcss";

// Hmart design system tokens (singulars + oulipo).
// See ~/Documents/second-brain/A2. Make/Hmart Design System.md for the full spec.
// Source: /Users/halim/Downloads/Hmart Design System.html
export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx}"],
  theme: {
    extend: {
      // Neutral palette = entire chrome. Black-alpha hierarchy.
      colors: {
        // Brand neutrals
        bg: "#FFFFFF",
        "text-primary": "rgba(0,0,0,0.85)",
        "text-hover": "rgba(0,0,0,0.70)",
        "text-secondary": "rgba(0,0,0,0.60)",
        "text-tertiary": "rgba(0,0,0,0.50)",
        "text-hint": "rgba(0,0,0,0.40)",
        border: "rgba(0,0,0,0.75)",
        "border-light": "rgba(0,0,0,0.12)",
        // Performance accents (raw + AA-darkened text variants).
        // Kanban mapping per ~/second-brain/A2. Make/Hmart Design System.md:
        // P0=carnation, P1=hard, P2=reverse, done=reinforcement, deadline-warn=versus.
        "acc-reverse": "#8B5CF6",
        "acc-reverse-text": "#6B3FE0",
        "acc-hard": "#2AA4DD",
        "acc-hard-text": "#1E6E96",
        "acc-reinforcement": "#02F700",
        "acc-reinforcement-text": "#0B7A0A",
        "acc-versus": "#FEE005",
        "acc-versus-text": "#6B5C00",
        "acc-carnation": "#F6009B",
        "acc-carnation-text": "#B8006F",
        // Status pill background tokens
        "pill-upcoming-bg": "#f3f4f6",
        "pill-upcoming-border": "#d1d5db",
        "pill-upcoming-text": "#4b5563",
        "pill-training-bg": "#ffffff",
        "pill-training-border": "#171717",
        "pill-training-text": "#171717",
        "pill-trained-bg": "#171717",
        "pill-trained-border": "#171717",
        "pill-trained-text": "#ffffff",
      },
      spacing: {
        // Tightened 8-step rem scale for compact operator console.
        "s-1": "0.125rem", // 2px
        "s-2": "0.25rem", // 4px
        "s-3": "0.5rem", // 8px
        "s-4": "0.75rem", // 12px
        "s-5": "1rem", // 16px
        "s-6": "1.5rem", // 24px
        "s-7": "2rem", // 32px
        "s-8": "3rem", // 48px
      },
      fontFamily: {
        // Production loads from type.cargo.site; dev uses substitutes.
        display: ["Terminal Grotesque", "VT323", "ui-monospace", "monospace"],
        body: [
          "Standard",
          "Space Grotesk",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "sans-serif",
        ],
        title: [
          "Diatype Variable",
          "Space Grotesk",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        mono: [
          "Diatype Mono Variable",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      fontSize: {
        nav: ["0.8125rem", { lineHeight: "1.2" }], // 13px
        base: ["0.875rem", { lineHeight: "1.35" }], // 14px
        caption: ["0.75rem", { lineHeight: "1.3" }], // 12px
        meta: ["0.6875rem", { lineHeight: "1.2" }], // 11px
        sub: ["1rem", { lineHeight: "1.2", fontWeight: "600" }], // 16px
        section: ["1.25rem", { lineHeight: "1.15", fontWeight: "700" }], // 20px
        display: [
          "5rem",
          { lineHeight: "0.9", letterSpacing: "-0.01em", fontWeight: "400" },
        ],
        "display-mobile": [
          "3rem",
          { lineHeight: "0.9", letterSpacing: "-0.01em", fontWeight: "400" },
        ],
      },
      letterSpacing: {
        tight: "-0.01em",
        tracked: "0.05em",
      },
      borderRadius: {
        // Tight corners only. 2px on pills, 6px on nav links. No big rounded panels.
        pill: "2px",
        nav: "6px",
        none: "0",
      },
      borderWidth: {
        hairline: "1px",
        accent: "4px",
        focus: "3px",
      },
      transitionDuration: {
        // 0.2s nav, 0.3s opacity / border, 0.5s grayscale. Ease only.
        nav: "200ms",
        std: "300ms",
        slow: "500ms",
      },
      screens: {
        // 768 / 900 / 600. Custom anchors per design system.
        mobile: { max: "600px" },
        tablet: { max: "900px" },
        sidebar: { max: "768px" },
      },
    },
  },
  plugins: [],
} satisfies Config;
