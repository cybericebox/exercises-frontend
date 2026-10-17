import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LoadError } from "./load-error"

describe("LoadError", () => {
  it("compact keeps the title, one help line and the retry", () => {
    render(<LoadError compact message="Не вдалося завантажити історію" onRetry={vi.fn()} />)
    const block = screen.getByRole("alert")
    expect(block).toHaveTextContent("Не вдалося завантажити історію")
    expect(block).toHaveTextContent("Перевірте зʼєднання та спробуйте ще раз.")
    expect(screen.getByRole("button", { name: "Спробувати ще раз" })).toBeInTheDocument()
    expect(block).toHaveClass("items-center", "justify-center")
  })
})
