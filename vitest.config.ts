import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "engine", root: "packages/engine", include: ["src/**/*.test.ts"] } },
      { test: { name: "catalog", root: "packages/catalog", include: ["src/**/*.test.ts"] } },
      { test: { name: "web", root: "apps/web", include: ["src/**/*.test.ts"] } },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});
