/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        // Short viewports (1080p at 125% scaling ≈ 864px tall): tighten vertical rhythm.
        short: { raw: "(max-height: 900px)" },
      },
      colors: {
        // NEXUS BLACK — the environment is black; hierarchy comes from luminance.
        void: {
          DEFAULT: "#000000",
          950: "#000000",
          900: "#050505",
          850: "#080808",
          800: "#0b0b0c",
          700: "#0e0e10",
          600: "#111113",
          500: "#16161a",
        },
        surface: {
          0: "#000000",
          1: "#080808",
          2: "#0e0e10",
          3: "#141416",
          4: "#1a1a1e",
        },
        // Accent is restrained: a cool platinum. Used sparingly for focus/active.
        accent: {
          DEFAULT: "#cfd6dd",
          50: "#f7f8fa",
          100: "#eef1f4",
          200: "#dfe4e9",
          300: "#cfd6dd",
          400: "#b4bdc7",
          500: "#8f9aa6",
          600: "#6b7682",
          700: "#4d5661",
          800: "#343a42",
          900: "#22262c",
        },
        // Warm highlight reserved for gaming/achievement moments.
        ember: {
          DEFAULT: "#d9a066",
          400: "#d9a066",
          500: "#c48a4f",
        },
        status: {
          nominal: "#9fd6b0",
          attention: "#d8b866",
          warning: "#d9a066",
          critical: "#d96b6b",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
        display: ["Space Grotesk", "Inter", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // Editorial display scale
        "display-xl": ["clamp(3rem, 5.5vw, 5.5rem)", { lineHeight: "0.95", letterSpacing: "0.02em" }],
        "display-lg": ["clamp(2.25rem, 3.6vw, 3.5rem)", { lineHeight: "1", letterSpacing: "0.02em" }],
        "display-md": ["clamp(1.6rem, 2.2vw, 2.25rem)", { lineHeight: "1.05", letterSpacing: "0.01em" }],
        "display-sm": ["1.375rem", { lineHeight: "1.15" }],
        micro: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.08em" }],
      },
      letterSpacing: {
        cinematic: "0.32em",
        wide2: "0.14em",
        wide3: "0.22em",
      },
      borderRadius: {
        none: "0",
        sm: "3px",
        DEFAULT: "6px",
        md: "6px",
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
        "3xl": "22px",
      },
      boxShadow: {
        // Occlusion, not glow.
        occlude: "0 30px 80px -30px rgba(0,0,0,0.9), 0 8px 24px -12px rgba(0,0,0,0.8)",
        lift: "0 12px 40px -18px rgba(0,0,0,0.85)",
        glow: "0 0 0 1px rgba(255,255,255,0.06)",
        "glow-sm": "0 0 0 1px rgba(255,255,255,0.05)",
        panel: "0 20px 60px -20px rgba(0,0,0,0.85)",
        "inset-line": "inset 0 1px 0 0 rgba(255,255,255,0.05)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "pulse-slow": { "0%, 100%": { opacity: "0.4" }, "50%": { opacity: "1" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.6s ease-out",
        "pulse-slow": "pulse-slow 3s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
      },
      transitionTimingFunction: {
        nexus: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
