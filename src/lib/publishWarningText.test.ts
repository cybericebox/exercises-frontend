import { describe, expect, it } from "vitest"
import { publishWarningText } from "./publishWarningText"

describe("publishWarningText", () => {
  it("names the subtask and the one variant without files", () => {
    expect(publishWarningText({ Code: "attachments_in_some_variants", Task: "Scan", WithFiles: [1, 3], WithoutFiles: [2] }))
      .toBe("Підзавдання «Scan»: у варіанті 2 немає файлів, а в інших варіантах вони є.")
  })

  it("lists several variants without files", () => {
    expect(publishWarningText({ Code: "attachments_in_some_variants", Task: "Scan", WithFiles: [1], WithoutFiles: [2, 3] }))
      .toBe("Підзавдання «Scan»: у варіантах 2, 3 немає файлів, а в інших варіантах вони є.")
  })

  it("falls back to the code for an unknown warning", () => {
    expect(publishWarningText({ Code: "something_new", Task: "", WithFiles: [], WithoutFiles: [] })).toBe("Зауваження: something_new")
  })
})
