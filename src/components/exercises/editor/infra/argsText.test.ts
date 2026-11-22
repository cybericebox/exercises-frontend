import { describe, expect, it } from "vitest"
import { joinArgs, splitArgs } from "./argsText"

describe("argsText", () => {
  it("splits on spaces and keeps quoted parts whole", () => {
    expect(splitArgs("nginx -g 'daemon off;'")).toEqual(["nginx", "-g", "daemon off;"])
    expect(splitArgs('sh -c "echo hi"')).toEqual(["sh", "-c", "echo hi"])
    expect(splitArgs("   ")).toEqual([])
  })

  it("round-trips parts with spaces, quotes and empty parts", () => {
    for (const parts of [["a", "b c"], ["it's", "x"], ["", "y"], ["-g", "daemon off;"]]) expect(splitArgs(joinArgs(parts))).toEqual(parts)
  })
})
