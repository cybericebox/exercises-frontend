import { describe, expect, it } from "vitest"
import errorsEn from "../../messages/errors.en.json"
import errorsUk from "../../messages/errors.uk.json"

/**
 * Codes of the exercise and lab families in the daemon's error catalog: passkeys and table views (233xx, 234xx), the exercise
 * document (231xx, 235xx), the console (335xx) and the lab (735xx). Snapshot of error-catalog/errors.en.json on the daemon's
 * feat/hardening @ a304078a. A code of these families that has no message here shows the author a raw server text instead of the catalog one.
 * Refresh: in the daemon repo run `git show <branch>:error-catalog/errors.en.json`, list the codes that start with 231, 233, 234, 235, 335 or 735,
 * add the new ones below, then add their uk and en texts to messages/errors.uk.json and errors.en.json (uk in the app's terms).
 */
const DAEMON_CODES = [
  23101, 23102, 23105, 23302, 23303, 23305, 23306, 23401, 23402, 23501, 23502, 23503, 23504, 23505, 23506, 23507, 23508, 23510, 23513,
  23517, 23519, 23520, 33518, 73509, 73511, 73512, 73514, 73515, 73516,
]

describe("error messages follow the daemon catalog", () => {
  const uk = errorsUk as Record<string, string>
  const en = errorsEn as Record<string, string>

  it.each(DAEMON_CODES)("has a uk and an en text for %i", (code) => {
    expect(uk[String(code)], `uk ${code}`).toBeTruthy()
    expect(en[String(code)], `en ${code}`).toBeTruthy()
  })

  it("keeps the two files on the same codes, except the codes only the app knows", () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort())
  })

  it("uses the app's terms in the new texts (no bootstrap, no «наприклад»)", () => {
    for (const code of DAEMON_CODES) expect(uk[String(code)]).not.toMatch(/bootstrap|наприклад/i)
  })
})
