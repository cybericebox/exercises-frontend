import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

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
