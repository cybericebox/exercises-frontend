import { describe, expect, it } from "vitest"
import { readPublishWarnings } from "./publishWarnings"

describe("readPublishWarnings", () => {
  it("reads an absent, null or non-array field as no warnings (older backends)", () => {
    expect(readPublishWarnings(undefined)).toEqual([])
    expect(readPublishWarnings(null)).toEqual([])
    expect(readPublishWarnings({})).toEqual([])
  })

  it("keeps the warnings of the answer with their subtask and variant numbers", () => {
    expect(readPublishWarnings([{ Code: "attachments_in_some_variants", Task: "Scan", WithFiles: [1, 3], WithoutFiles: [2] }]))
      .toEqual([{ Code: "attachments_in_some_variants", Task: "Scan", WithFiles: [1, 3], WithoutFiles: [2] }])
  })

  it("fills missing lists and drops entries that are not warnings", () => {
    expect(readPublishWarnings([{ Code: "attachments_in_some_variants", Task: "Scan" }, null, "x", { Task: "no code" }]))
      .toEqual([{ Code: "attachments_in_some_variants", Task: "Scan", WithFiles: [], WithoutFiles: [] }])
  })
})
