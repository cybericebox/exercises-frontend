import { describe, expect, it } from "vitest"
import { DEFAULT_EDITOR_POSITION, editorPositionStorageKey, parseEditorPosition } from "./editorPosition"

describe("editorPosition", () => {
  it("builds a per-user, per-exercise storage key", () => {
    expect(editorPositionStorageKey("u1", "e1")).toBe("cib_exercise_position_u1_e1")
  })

  it("normalizes a stored position and rejects garbage", () => {
    expect(parseEditorPosition(JSON.stringify({ ...DEFAULT_EDITOR_POSITION, tab: "variants", variant: 2, devicePanel: "env" })))
      .toMatchObject({ tab: "variants", variant: 2, devicePanel: "env" })
    expect(parseEditorPosition(JSON.stringify({ tab: "bogus", variant: -1 }))).toEqual(DEFAULT_EDITOR_POSITION)
    expect(parseEditorPosition("{")).toBeNull()
    expect(parseEditorPosition(null)).toBeNull()
  })
})
