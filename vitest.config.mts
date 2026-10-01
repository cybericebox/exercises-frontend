import { configDefaults, defineConfig } from "vitest/config"
import path from "node:path"
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    env: {
      NEXT_PUBLIC_API_HOST: "api.cybericebox.local",
      NEXT_PUBLIC_ID_HOST: "id.cybericebox.local",
      NEXT_PUBLIC_ADMIN_HOST: "admin.cybericebox.local",
      NEXT_PUBLIC_EXERCISES_HOST: "exercises.cybericebox.local",
      NEXT_PUBLIC_EVENT_DOMAIN: "cybericebox.local",
      // jsdom runs on localhost and drops cookies set for another domain
      NEXT_PUBLIC_COOKIE_DOMAIN: "localhost",
    },
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**", "**/.worktrees/**"],
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
})
