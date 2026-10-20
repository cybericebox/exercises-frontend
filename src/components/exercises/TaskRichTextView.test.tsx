import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import copyBlockFixture from "./copyBlockFixture.json"
import { TaskRichTextView } from "./TaskRichTextView"

const doc = (...names: string[]) => ({ root: { type: "root", children: [{ type: "paragraph", children: names.map((varName) => ({ type: "variable", varName })) }] } })

describe("TaskRichTextView variables", () => {
  it("renders a resolved value as plain inline text with no chip styling", () => {
    const { container } = render(<TaskRichTextView value={doc("ip", "gone")} variables={{ ip: "10.0.0.5", gone: "—" }} />)
    const ip = container.querySelector('[data-task-variable="ip"]') as HTMLElement
    expect(ip.tagName).toBe("SPAN")
    expect(ip.textContent).toBe("10.0.0.5")
    expect(ip.className).toBe("")
    expect(container.querySelector('[data-task-variable="gone"]')?.textContent).toBe("—")
    expect(container.querySelector("button")).toBeNull()
  })

  it("renders an IP link as a plain new-tab anchor", () => {
    const { container } = render(<TaskRichTextView value={doc("l")} variables={{ l: "http://10.0.0.5:8080" }} links={{ l: "http://10.0.0.5:8080" }} />)
    const a = container.querySelector("a") as HTMLAnchorElement
    expect(a.getAttribute("href")).toBe("http://10.0.0.5:8080/")
    expect(a.target).toBe("_blank")
    expect(a.className).not.toMatch(/border|bg-|font-mono/)
  })

  it("renders an external link as an anchor that mints the access link on click", () => {
    const open = vi.fn()
    const target = { device: "web", port: 8080 }
    const { container } = render(<TaskRichTextView value={doc("x")} variables={{ x: "web.lab" }} external={{ x: target }} onOpenExternal={open} />)
    expect(container.querySelector("button")).toBeNull()
    fireEvent.click(screen.getByText("web.lab"))
    expect(open).toHaveBeenCalledWith(target, "x")
  })
})

it("renders resolved copy-block children and copies plain text with a safe open action", async () => {
 const write = vi.fn().mockResolvedValue(undefined)
 Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true })
 const value = { root: { type: "root", children: [{ type: "copy-block", version: 1, direction: null, format: "", indent: 0, children: [
  { type: "text", text: "http://", format: 1 }, { type: "variable", varName: "ip" }, { type: "text", text: ":8080" },
 ] }] } }
 render(<TaskRichTextView value={value} variables={{ ip: "10.0.0.5" }} />)
 fireEvent.click(screen.getByRole("button", { name: "Скопіювати" }))
 expect(write).toHaveBeenCalledWith("http://10.0.0.5:8080")
 expect(screen.getByRole("button", { name: "Відкрити в новій вкладці" })).toBeInTheDocument()
})
it("never offers to open a copy-block with an unsafe scheme", () => {
 render(<TaskRichTextView value={{ root: { type: "root", children: [{ type: "copy-block", children: [{ type: "text", text: "javascript:alert(1)" }] }] } }} />)
 expect(screen.getByRole("button", { name: "Скопіювати" })).toBeInTheDocument()
 expect(screen.queryByRole("button", { name: "Відкрити в новій вкладці" })).not.toBeInTheDocument()
})

it("reads the exact cross-app JSON fixture and opens the complete destination", () => {
 const open = vi.spyOn(window, "open").mockImplementation(() => null)
 render(<TaskRichTextView value={copyBlockFixture} variables={{ host: "example.test" }} />)
 expect(screen.getByText("https://example.test/panel?x=1&y=2")).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button", { name: "Відкрити в новій вкладці" }))
 expect(open).toHaveBeenCalledWith("https://example.test/panel?x=1&y=2", "_blank", "noopener,noreferrer")
 open.mockRestore()
})
it("does not open an unresolved variable that syntactically resembles a URL", () => {
 render(<TaskRichTextView value={copyBlockFixture} variables={{ host: "—" }} />)
 expect(screen.queryByRole("button", { name: "Відкрити в новій вкладці" })).not.toBeInTheDocument()
})

it("opens a composed URL on another host directly even when its query contains a device variable", () => {
 const direct = vi.spyOn(window, "open").mockImplementation(() => null)
 const proxy = vi.fn()
 const value = { root: { type: "root", children: [{ type: "copy-block", children: [{ type: "text", text: "https://docs.test/?device=" }, { type: "variable", varName: "web" }] }] } }
 render(<TaskRichTextView value={value} variables={{ web: "https://web.lab.test" }} external={{ web: { device: "web", port: 443 } }} onOpenExternal={proxy} />)
 fireEvent.click(screen.getByRole("button", { name: "Відкрити в новій вкладці" }))
 expect(direct).toHaveBeenCalledWith("https://docs.test/?device=https://web.lab.test", "_blank", "noopener,noreferrer")
 expect(proxy).not.toHaveBeenCalled()
 direct.mockRestore()
})
it("passes a composed device destination with its path, query and fragment to fresh proxy opening", () => {
 const proxy = vi.fn()
 const value = { root: { type: "root", children: [{ type: "copy-block", children: [{ type: "variable", varName: "web" }, { type: "text", text: "/panel?x=1#details" }] }] } }
 render(<TaskRichTextView value={value} variables={{ web: "https://web.lab.test" }} external={{ web: { device: "web", port: 443 } }} onOpenExternal={proxy} />)
 fireEvent.click(screen.getByRole("button", { name: "Відкрити в новій вкладці" }))
 expect(proxy).toHaveBeenCalledWith({ device: "web", port: 443 }, "web", "/panel?x=1#details")
})
