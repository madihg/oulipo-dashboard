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
        // Brand neutrals - halimmadi.com: warm paper + neutral ink.
        bg: "#FFFFFF",
        paper: "#ffffff",
        "ground-2": "#fbfaf7",
        hair: "#e6e4de",
        ink: "#161617",
        "text-primary": "rgba(0,0,0,0.85)",
        "text-hover": "rgba(0,0,0,0.62)",
        "text-secondary": "rgba(0,0,0,0.60)",
        "text-tertiary": "rgba(0,0,0,0.50)",
        "text-hint": "rgba(0,0,0,0.42)",
        border: "rgba(0,0,0,0.75)",
        "border-light": "#e6e4de",
        // Primary accent + marks (halimmadi).
        cobalt: "#1c39e8",
        "cobalt-hover": "#1430c0",
        gold: "#e89b1b",
        // Performance accents (raw + AA-darkened text variants).
        // Kanban mapping: P0=cobalt, P1=gold, P2=violet, done=viridian,
        // deadline-warn=vermilion.
        "acc-reverse": "#6E4BD0",
        "acc-reverse-text": "#5A3BB0",
        "acc-hard": "#E89B1B",
        "acc-hard-text": "#8A6310",
        "acc-reinforcement": "#1E8E5A",
        "acc-reinforcement-text": "#176E46",
        "acc-versus": "#E5391C",
        "acc-versus-text": "#C0301A",
        "acc-carnation": "#1C39E8",
        "acc-carnation-text": "#1430C0",
        // Status pill background tokens
        "pill-upcoming-bg": "#f1efe9",
        "pill-upcoming-border": "#d8d5cc",
        "pill-upcoming-text": "#6b6660",
        "pill-training-bg": "#ffffff",
        "pill-training-border": "#161617",
        "pill-training-text": "#161617",
        "pill-trained-bg": "#161617",
        "pill-trained-border": "#161617",
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
