module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: ["dist", "src-tauri", "node_modules", ".eslintrc.cjs", "*.config.js", "*.config.ts"],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["react-refresh", "react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/consistent-type-imports": "warn",
  },
  overrides: [
    {
      // PORTABLE LIFE DOMAIN: consumable by a future mobile app. No React, DOM,
      // Tauri, Windows, providers or app state may leak in here.
      files: ["src/core/life/**/*.ts"],
      excludedFiles: ["src/core/life/**/*.test.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["react", "react-dom", "react/*"], message: "core/life is portable domain logic — no React." },
              { group: ["@tauri-apps/*", "@tauri-apps/api/*"], message: "core/life must not depend on Tauri." },
              { group: ["@/providers/*", "@/state/*", "@/components/*", "@/screens/*", "@/hooks/*", "@/app/*"], message: "core/life must not depend on app layers." },
              { group: ["zustand", "framer-motion", "lucide-react"], message: "core/life is UI-free." },
            ],
          },
        ],
        "no-restricted-globals": ["error", "window", "document", "localStorage", "navigator"],
      },
    },
  ],
};
