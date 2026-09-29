import { configDefaults, defineConfig } from "vitest/config"
import path from "node:path"
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**", "**/.worktrees/**"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
})
