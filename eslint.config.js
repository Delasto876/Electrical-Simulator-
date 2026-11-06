// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-artifact/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "tools/blender/.venv/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // The engine and catalog must stay pure: no DOM, React or three.js.
    files: ["packages/**/*.ts"],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-*", "three", "three/*", "@react-three/*"],
              message: "packages/* must not depend on UI or three.js (see PLAN.md).",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage"],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["apps/web/*.ts", "apps/web/e2e/**/*.ts", "*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
