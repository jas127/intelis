import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        borderSubtle: "var(--border-subtle)",
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        cobalt: {
          DEFAULT: "var(--accent-cobalt)",
          soft: "var(--accent-cobalt-soft)",
        },
        coral: {
          DEFAULT: "var(--accent-coral)",
          soft: "var(--accent-coral-soft)",
        },
        orange: {
          DEFAULT: "var(--accent-orange)",
          soft: "var(--accent-orange-soft)",
        },
        lavender: {
          DEFAULT: "var(--accent-lavender)",
          soft: "var(--accent-lavender-soft)",
        },
        emeraldBrand: {
          DEFAULT: "var(--accent-green)",
          soft: "var(--accent-green-soft)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
