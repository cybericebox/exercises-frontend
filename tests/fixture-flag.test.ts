import { spawnSync } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { isConsoleFrameUrl } from "../src/lib/consoleFrame.ts"

// The editor fixture mode (canned API, blob: console frames) is a dev-only switch. These tests are the proof that a production
// build or image cannot have it on: the build refuses the flag, and the code that reads it is off whenever NODE_ENV is production.
describe("fixture flag cannot reach production", () => {
  it("fails a production build that has the flag (next.config.ts)", () => {
    const run = (env: Record<string, string>) => spawnSync(process.execPath, ["--input-type=module", "-e", `await import("./next.config.ts")`], {
      env: { ...process.env, NEXT_PUBLIC_DOMAIN: "example.test", NEXT_PUBLIC_SUPPORT_EMAIL: "a@example.test", ...env }, encoding: "utf8",
    })
    const withFlag = run({ NODE_ENV: "production", NEXT_PUBLIC_EDITOR_FIXTURES: "1" })
    expect(withFlag.status).not.toBe(0)
    expect(withFlag.stderr).toContain("NEXT_PUBLIC_EDITOR_FIXTURES")
    expect(run({ NODE_ENV: "production" }).status).toBe(0)
  })

  it("accepts a blob: console link only in development with the flag", () => {
    vi.stubEnv("NEXT_PUBLIC_EDITOR_FIXTURES", "1")
    vi.stubEnv("NODE_ENV", "production")
    expect(isConsoleFrameUrl("blob:https://example.test/abc", "example.test")).toBe(false)
    vi.stubEnv("NODE_ENV", "development")
    expect(isConsoleFrameUrl("blob:https://example.test/abc", "example.test")).toBe(true)
    vi.stubEnv("NEXT_PUBLIC_EDITOR_FIXTURES", "")
    expect(isConsoleFrameUrl("blob:https://example.test/abc", "example.test")).toBe(false)
    vi.unstubAllEnvs()
  })
})
