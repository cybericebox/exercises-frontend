import { describe, expect, it } from "vitest"
import { hintTextHasContent, hintTextToState, stateToHintText } from "./hintText"

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

  it("strips text alignment, keeping text formats", () => {
    const doc = { root: { type: "root", format: "", children: [{ type: "heading", tag: "h2", format: "center", children: [{ type: "text", text: "Hi", format: 1 }] }] } }
    const stored = JSON.parse(stateToHintText(doc))
    expect(stored.root.children[0].format).toBe("")
    expect(stored.root.children[0].children[0].format).toBe(1)
  })

  it("tells whether a hint has text", () => {
    expect(hintTextHasContent("")).toBe(false)
    expect(hintTextHasContent("   ")).toBe(false)
    expect(hintTextHasContent(JSON.stringify({ root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: " " }] }, { type: "paragraph", children: [] }] } }))).toBe(false)
    expect(hintTextHasContent("plain")).toBe(true)
    expect(hintTextHasContent(JSON.stringify({ root: { type: "root", children: [{ type: "paragraph", children: [{ type: "variable", varName: "ph_ip" }] }] } }))).toBe(true)
  })
})
