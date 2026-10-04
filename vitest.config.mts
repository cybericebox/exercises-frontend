import { configDefaults, defineConfig } from "vitest/config"
import path from "node:path"
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    env: {
      // The one base domain; every host derives from it. ("localhost" where jsdom must accept the shared-domain cookies.)
      NEXT_PUBLIC_DOMAIN: "localhost",
      NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.test",
    },
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**", "**/.worktrees/**"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
})
