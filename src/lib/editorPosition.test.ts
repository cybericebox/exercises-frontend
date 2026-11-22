import { describe, expect, it } from "vitest"
import { DEFAULT_EDITOR_POSITION, editorPositionStorageKey, parseEditorPosition } from "./editorPosition"

describe("editorPosition", () => {
  it("builds a per-user, per-exercise storage key", () => {
    expect(editorPositionStorageKey("u1", "e1")).toBe("cib_exercise_position_u1_e1")
  })

  it("normalizes a stored position and rejects garbage", () => {
    expect(parseEditorPosition(JSON.stringify({ ...DEFAULT_EDITOR_POSITION, tab: "tasks", variant: 2, devicePanel: "env", infraView: "vars", deviceSection: "access", condition: 3 })))
      .toMatchObject({ tab: "tasks", variant: 2, devicePanel: "env", infraView: "vars", deviceSection: "access", condition: 3 })
    expect(parseEditorPosition(JSON.stringify({ tab: "bogus", variant: -1 }))).toEqual(DEFAULT_EDITOR_POSITION)
    expect(parseEditorPosition("{")).toBeNull()
  })

  it("maps a position stored by the earlier editor onto the new tabs", () => {
    expect(parseEditorPosition(JSON.stringify({ tab: "variants", section: "tasks", variant: 1 }))).toMatchObject({ tab: "tasks", variant: 1 })
    expect(parseEditorPosition(JSON.stringify({ tab: "variants", section: "topology" }))).toMatchObject({ tab: "infrastructure" })
    expect(parseEditorPosition(JSON.stringify({ tab: "variants", section: "note" }))).toMatchObject({ tab: "tasks" })
    expect(parseEditorPosition(JSON.stringify({ tab: "all" }))).toMatchObject({ tab: "variants" })
    expect(parseEditorPosition(JSON.stringify({ tab: "general" }))).toMatchObject({ tab: "general" })
  })

  it("keeps null for a missing value", () => {
    expect(parseEditorPosition(null)).toBeNull()
  })
})
