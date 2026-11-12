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
    // A ceiling, not a speed: the slowest healthy tests take 1-3 s on an idle machine (jsdom, many interactions), so the 5 s
    // default fails them on a loaded runner or when several suites run at once. A real hang still fails after 20 s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**", "**/.worktrees/**", "**/.superpowers/**"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
})
