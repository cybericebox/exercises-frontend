import { describe, expect, it } from "vitest"

import { exampleLabLink, labId, uuidFromLabId } from "./labId"

// The same vectors are asserted by names.LabID in laboratory (internal/names/webhost_test.go).
const vectors: [string, string][] = [
  ["00000000-0000-0000-0000-000000000000", "0000000000000000000000000"],
  ["00000000-0000-0000-0000-000000000001", "0000000000000000000000001"],
  ["00000000-0000-0000-0000-000000000024", "0000000000000000000000010"],
  ["7f3c9a2e-4b1d-4e8a-9c6f-2d5b8e1a0c47", "7j6eora4bm1lw7i6anorqigxz"],
  ["ffffffff-ffff-ffff-ffff-ffffffffffff", "f5lxx1zz5pnorynqglhzmsp33"],
]

describe("labId", () => {
  it.each(vectors)("encodes %s and decodes it back", (uuid, id) => {
    expect(labId(uuid)).toBe(id)
    expect(uuidFromLabId(id)).toBe(uuid)
  })

  it("rejects junk", () => {
    for (const bad of ["", "short", "Z".repeat(25), "-".repeat(25), "z".repeat(25), "0".repeat(26)]) {
      expect(uuidFromLabId(bad)).toBeNull()
    }
    expect(() => labId("nope")).toThrow()
  })

  it("builds the example link shown to authors", () => {
    expect(exampleLabLink("web")).toBe("https://web-7j6eora4bm1lw7i6anorqigxz.example-challenges.com")
  })
})
