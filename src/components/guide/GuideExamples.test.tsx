import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/api/exercises/archive", () => ({ getImportExampleDocument: vi.fn() }))
import { getImportExampleDocument } from "@/api/exercises/archive"
import { GuideExamples } from "./GuideExamples"

const load = vi.mocked(getImportExampleDocument)
const writeText = vi.fn().mockResolvedValue(undefined)

describe("GuideExamples", () => {
  beforeEach(() => {
    load.mockReset()
    writeText.mockClear()
    vi.stubGlobal("navigator", { clipboard: { writeText } })
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("shows the loader, then YAML by default, then JSON on its tab; copy takes the active tab", async () => {
    load.mockResolvedValueOnce({ Yaml: "schema: cib-exercise/1", Json: '{"schema":"cib-exercise/1"}' })
    render(<GuideExamples />)
    expect(screen.getByText("Завантажуємо приклад…")).toBeInTheDocument()
    expect(await screen.findByText("schema: cib-exercise/1")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "YAML" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Копіювати YAML" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("schema: cib-exercise/1"))
    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent("Скопійовано")

    fireEvent.click(screen.getByRole("radio", { name: "JSON" }))
    expect(screen.getByText('{"schema":"cib-exercise/1"}')).toBeInTheDocument()
    expect(screen.queryByText("schema: cib-exercise/1")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Копіювати JSON" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('{"schema":"cib-exercise/1"}'))
  })

  it("shows the shared load error and retries", async () => {
    load.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ Yaml: "ok: 1", Json: "{}" })
    render(<GuideExamples />)
    expect(await screen.findByText("Не вдалося завантажити приклад документа")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще раз" }))
    expect(await screen.findByText("ok: 1")).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
