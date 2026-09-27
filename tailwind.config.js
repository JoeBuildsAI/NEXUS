/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep charcoal / black cinematic base
        void: {
          DEFAULT: "#05070a",
          950: "#05070a",
          900: "#0a0d12",
          850: "#0e1218",
          800: "#12171f",
          700: "#1a212b",
          600: "#242e3b",
        },
        // Restrained accent — a cool, expensive cyan-steel
        accent: {
          DEFAULT: "#5ed0e6",
          50: "#eafafd",
          100: "#c9f1f8",
          200: "#9fe6f2",
          300: "#6fd7e9",
          400: "#5ed0e6",
          500: "#38b4cf",
          600: "#2790a8",
          700: "#226f82",
          800: "#204e5c",
          900: "#1c3742",
        },
        // Warm secondary accent for gaming / energy states
        ember: {
          DEFAULT: "#e6a15e",
          400: "#e6a15e",
          500: "#d4863b",
        },
        glass: {
          border: "rgba(255,255,255,0.08)",
          surface: "rgba(255,255,255,0.04)",
        },
        status: {
          nominal: "#5ee6a1",
          attention: "#e6cf5e",
          warning: "#e6a15e",
          critical: "#e65e6f",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "Consolas", "monospace"],
        display: ["Orbitron", "Inter", "sans-serif"],
      },
      letterSpacing: {
        cinematic: "0.35em",
        wide2: "0.15em",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(94,208,230,0.35)",
        "glow-sm": "0 0 20px -8px rgba(94,208,230,0.3)",
        panel: "0 20px 60px -20px rgba(0,0,0,0.7)",
        "inset-line": "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "shimmer": {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s ease-out",
        scan: "scan 4s linear infinite",
        "pulse-slow": "pulse-slow 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [],
};
