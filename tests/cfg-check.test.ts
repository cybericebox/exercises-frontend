// The rule for the optional installation settings: the TypeScript one (next.config) and the shell one (deploy/cfg-check.sh, the container
// entrypoint and the Pages workflow) agree with the shared vectors (tests/cfg-vectors.json, identical in every repository).
import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import path from "node:path"
import vectors from "./cfg-vectors.json"
import { flagSettingError, urlSettingError } from "@/lib/settingRules"

const SCRIPT = path.resolve(import.meta.dirname, "../deploy/cfg-check.sh")

// The rule runs in the container under busybox ash (nginx alpine). The POSIX shells of this machine stand in for it: `sh` (dash on Debian,
// bash on macOS), dash, and busybox ash where installed. A shell that is not installed is skipped, never silently replaced.
const SHELLS: [string, string[]][] = [["sh", ["sh"]], ["dash", ["dash"]], ["busybox ash", ["busybox", "ash"]], ["bash --posix", ["bash", "--posix"]]]
const installed = SHELLS.filter(([, cmd]) => spawnSync(cmd[0], [...cmd.slice(1), "-c", "exit 0"]).status === 0)

function shellAccepts(shell: string[], fn: "cfg_url_check" | "cfg_flag_check", value: string): boolean {
  const run = spawnSync(shell[0], [...shell.slice(1), "-c", `. "${SCRIPT}"; ${fn} CFG_VALUE`], { env: { ...process.env, CFG_VALUE: value } })
  return run.status === 0
}

describe("url setting rule", () => {
  it.each(vectors.url)("TypeScript: $value", ({ value, valid }) => {
    expect(urlSettingError(value) === null).toBe(valid)
  })
  it.each(installed.flatMap(([name, shell]) => vectors.url.map((v) => ({ name, shell, ...v }))))("shell $name: $value", ({ shell, value, valid }) => {
    expect(shellAccepts(shell, "cfg_url_check", value)).toBe(valid)
  })
})

describe("flag setting rule", () => {
  it.each(vectors.flag)("TypeScript: $value", ({ value, valid }) => {
    expect(flagSettingError(value) === null).toBe(valid)
  })
  it.each(installed.flatMap(([name, shell]) => vectors.flag.map((v) => ({ name, shell, ...v }))))("shell $name: $value", ({ shell, value, valid }) => {
    expect(shellAccepts(shell, "cfg_flag_check", value)).toBe(valid)
  })
})

it.each(installed)("an unset variable is valid for both rules (%s)", (_, shell) => {
  const run = spawnSync(shell[0], [...shell.slice(1), "-c", `set -e; . "${SCRIPT}"; cfg_url_check UNSET_NAME && cfg_flag_check UNSET_NAME`], { env: { ...process.env } })
  expect(run.status).toBe(0)
})

it("has a POSIX shell to run the rule in", () => {
  expect(installed.length).toBeGreaterThan(0)
})
