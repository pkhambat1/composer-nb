import { defineConfig } from "vitest/config"

export default defineConfig({
  // The engine's source (dsl/js), not its build in dsl/lib, so tests never run a stale build
  resolve: { conditions: ["composer-nb-source"] },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
})
