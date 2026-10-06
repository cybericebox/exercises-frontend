import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))

import { FeedbackMenuItem } from "./FeedbackMenuItem"

describe("FeedbackMenuItem", () => {
  it("is a mailto menu item", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <FeedbackMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const item = screen.getByRole("menuitem", { name: "feedback.link" })
    expect(item.tagName).toBe("A")
    expect(item.getAttribute("href")).toMatch(/^mailto:/)
  })
})
