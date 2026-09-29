import { describe, expect, it } from "vitest"
import { hintTextToState, stateToHintText } from "./hintText"

describe("hint text", () => {
  it("round-trips a rich-text document", () => {
    const doc = { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "Look at headers" }] }] } }
    const text = stateToHintText(doc)
    expect(JSON.parse(text)).toEqual(doc)
    expect(hintTextToState(text)).toEqual(doc)
  })

  it("opens plain text from older drafts as paragraphs", () => {
    const state = hintTextToState("one\ntwo") as { root: { children: { children: { text: string }[] }[] } }
    expect(state.root.children.map((p) => p.children[0]?.text)).toEqual(["one", "two"])
  })

  it("keeps an empty hint empty", () => {
    expect(hintTextToState("")).toBeNull()
    expect(stateToHintText(null)).toBe("")
    expect(stateToHintText({ root: { type: "root", children: [{ type: "paragraph", children: [] }] } })).toBe("")
  })
})
