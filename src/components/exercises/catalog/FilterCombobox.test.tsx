import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, unknown>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { FilterCombobox, type FilterOption } from "./FilterCombobox"

const STATUSES: FilterOption[] = [
  { value: "published", label: "Опубліковані" },
  { value: "changed", label: "Є зміни" },
  { value: "draft", label: "Не опубліковані", meta: "чернетка" },
]

function Controlled(props: Partial<React.ComponentProps<typeof FilterCombobox>> & { initial?: string[] }) {
  const [value, setValue] = useState<string[]>(props.initial ?? [])
  return <>
    <FilterCombobox label="Статус" placeholder="Усі статуси" emptyMessage="Нічого" errorMessage="Не вдалося" {...props} value={value} onChange={(next) => { setValue(next); props.onChange?.(next) }} />
    <output data-testid="value">{value.join(",")}</output>
  </>
}

describe("FilterCombobox", () => {
  it("keeps pointer and focus interactions on its anchor open, but dismisses for real outside targets", async () => {
    render(<><Controlled options={STATUSES} initial={["published"]} /><button>Outside</button></>)
    const box = screen.getByRole("combobox", { name: "Статус" })
    const outside = screen.getByRole("button", { name: "Outside" })
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)))
    const clickWithFocus = async (element: HTMLElement) => {
      fireEvent.pointerDown(element, { pointerType: "mouse" })
      act(() => element.focus())
      fireEvent.pointerUp(element, { pointerType: "mouse" })
      fireEvent.click(element)
      await settle()
    }
    await clickWithFocus(box)
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute("aria-expanded", "true")
    // Repeated clicks and moving focus to a chip stay within the same field.
    await clickWithFocus(box)
    expect(screen.getByRole("listbox", { name: "Статус" })).toBeInTheDocument()
    await clickWithFocus(screen.getByRole("button", { name: "exercises.filter.remove Опубліковані" }))
    expect(box).toHaveAttribute("aria-expanded", "true")
    await clickWithFocus(outside)
    expect(box).toHaveAttribute("aria-expanded", "false")
    act(() => box.focus())
    expect(box).toHaveAttribute("aria-expanded", "true")
    act(() => outside.focus())
    expect(box).toHaveAttribute("aria-expanded", "false")
    act(() => box.focus())
    await settle()
    // A pointer click on a non-focusing outside target still dismisses the list.
    fireEvent.pointerDown(document.body, { pointerType: "mouse" })
    fireEvent.pointerUp(document.body, { pointerType: "mouse" })
    fireEvent.click(document.body)
    await settle()
    expect(box).toHaveAttribute("aria-expanded", "false")
  })

  it("opens a list on focus, toggles several values and shows them as chips", () => {
    render(<Controlled options={STATUSES} />)
    const box = screen.getByRole("combobox", { name: "Статус" })
    expect(box).toHaveAttribute("aria-expanded", "false")
    fireEvent.focus(box)
    expect(box).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("listbox", { name: "Статус" })).toHaveAttribute("aria-multiselectable", "true")
    fireEvent.click(screen.getByRole("option", { name: "Опубліковані" }))
    fireEvent.click(screen.getByRole("option", { name: "Є зміни" }))
    expect(screen.getByTestId("value")).toHaveTextContent("published,changed")
    expect(screen.getByRole("option", { name: "Опубліковані" })).toHaveAttribute("aria-selected", "true")
    // A chosen value toggles off from the list.
    fireEvent.click(screen.getByRole("option", { name: "Опубліковані" }))
    expect(screen.getByTestId("value")).toHaveTextContent("changed")
    expect(screen.getByRole("button", { name: "exercises.filter.remove Є зміни" })).toBeInTheDocument()
  })

  it("filters a static list by the typed text, the meta included", () => {
    render(<Controlled options={STATUSES} />)
    const box = screen.getByRole("combobox", { name: "Статус" })
    fireEvent.change(box, { target: { value: "черн" } })
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Не опублікованічернетка"])
    fireEvent.change(box, { target: { value: "zzz" } })
    expect(screen.getByText("Нічого")).toBeInTheDocument()
  })

  it("is driven by the keyboard: arrows, Enter, Escape and Backspace", () => {
    render(<Controlled options={STATUSES} />)
    const box = screen.getByRole("combobox", { name: "Статус" })
    fireEvent.focus(box)
    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "ArrowDown" })
    expect(box.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id)
    fireEvent.keyDown(box, { key: "Enter" })
    expect(screen.getByTestId("value")).toHaveTextContent("changed")
    fireEvent.keyDown(box, { key: "ArrowUp" })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(screen.getByTestId("value")).toHaveTextContent("changed,published")
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box).toHaveAttribute("aria-expanded", "false")
    fireEvent.keyDown(box, { key: "Backspace" })
    expect(screen.getByTestId("value")).toHaveTextContent("changed")
  })

  it("removes one chip or clears the field", () => {
    const onChange = vi.fn()
    render(<Controlled options={STATUSES} initial={["published", "draft"]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "exercises.filter.remove Опубліковані" }))
    expect(screen.getByTestId("value")).toHaveTextContent("draft")
    fireEvent.click(screen.getByRole("button", { name: "exercises.filter.clearField Статус" }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.queryByRole("button", { name: /exercises\.filter\.clearField/ })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveAttribute("placeholder", "Усі статуси")
  })

  it("asks an async source per text, shows the crest while waiting and keeps the labels of chosen values", async () => {
    let answer: (items: FilterOption[]) => void = () => undefined
    const load = vi.fn((query: string) => new Promise<FilterOption[]>((resolve) => { answer = resolve; void query }))
    render(<Controlled load={load} labelFor={(id) => id === "u9" ? "З посилання" : undefined} initial={["u9"]} />)
    // A chosen value never listed is named by labelFor.
    expect(screen.getByText("З посилання")).toBeInTheDocument()
    fireEvent.focus(screen.getByRole("combobox"))
    await waitFor(() => expect(load).toHaveBeenCalledWith(""))
    expect(screen.getByRole("listbox").querySelector(".loading-area")).not.toBeNull()
    await act(async () => answer([{ value: "u1", label: "Ада", meta: "3" }]))
    fireEvent.click(screen.getByRole("option", { name: /Ада/ }))
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "бо" } })
    await waitFor(() => expect(load).toHaveBeenLastCalledWith("бо"))
    await act(async () => answer([{ value: "u2", label: "Боб" }]))
    // «Ада» is not in this answer, yet her chip keeps the name.
    expect(screen.getByRole("button", { name: "exercises.filter.remove Ада" })).toBeInTheDocument()
  })

  it("shows the shared load error with a retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([{ value: "web", label: "web" }])
    render(<Controlled load={load} />)
    fireEvent.focus(screen.getByRole("combobox"))
    expect(await screen.findByText("Не вдалося")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "error.load.retry" }))
    expect(await screen.findByRole("option", { name: "web" })).toBeInTheDocument()
  })

  it("cycles a так/ні option off → так → ні → off and names the state in words", () => {
    function TriState() {
      const [yes, setYes] = useState<string[]>([])
      const [no, setNo] = useState<string[]>([])
      return <>
        <FilterCombobox label="Теги" placeholder="Пошук" emptyMessage="Нічого" options={[{ value: "web", label: "web" }, { value: "old", label: "old" }]}
          value={yes} onChange={setYes} excluded={no} onExcludedChange={setNo} />
        <output data-testid="state">{`yes=${yes.join(",")};no=${no.join(",")}`}</output>
      </>
    }
    render(<TriState />)
    fireEvent.focus(screen.getByRole("combobox", { name: "Теги" }))
    // The list starts with what a press does, tied to the list for screen readers.
    const hint = screen.getByText("exercises.filter.tags.cycleHint")
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-describedby", hint.id)
    const web = () => screen.getByRole("option", { name: /web/ })
    const box = () => web().querySelector("span[aria-hidden]")!
    // Off: an empty box, no word.
    expect(box().querySelector("svg")).toBeNull()
    expect(web()).not.toHaveTextContent(/exercises\.filter\.tags\.(yes|no)/)
    fireEvent.click(web())
    // «так»: a check mark and the word.
    expect(box().querySelector("svg.lucide-check")).not.toBeNull()
    expect(screen.getByTestId("state")).toHaveTextContent("yes=web;no=")
    expect(web()).toHaveAttribute("data-state", "yes")
    expect(web()).toHaveTextContent("exercises.filter.tags.yes")
    fireEvent.click(web())
    expect(screen.getByTestId("state")).toHaveTextContent("yes=;no=web")
    expect(web()).toHaveAttribute("data-state", "no")
    expect(web()).toHaveTextContent("exercises.filter.tags.no")
    // «ні»: a minus in a dashed box, not only another colour.
    expect(box().querySelector("svg.lucide-minus")).not.toBeNull()
    expect(box()).toHaveClass("border-dashed")
    // The chip says «ні» with an icon and a word, and its remove button names both.
    const chip = document.querySelector('[data-state="no"]:not([role])')!
    expect(chip).toHaveTextContent("exercises.filter.tags.no")
    expect(chip.querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("button", { name: "exercises.filter.tags.remove web exercises.filter.tags.no" })).toBeInTheDocument()
    // Keyboard: Enter on the active option goes on to off.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
    expect(screen.getByTestId("state")).toHaveTextContent("yes=;no=")
    expect(web()).toHaveAttribute("data-state", "off")
    fireEvent.click(web())
    fireEvent.click(screen.getByRole("option", { name: /old/ }))
    fireEvent.click(screen.getByRole("option", { name: /old/ }))
    expect(screen.getByTestId("state")).toHaveTextContent("yes=web;no=old")
    // Backspace removes the last chip; «Очистити» clears both.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" })
    expect(screen.getByTestId("state")).toHaveTextContent("yes=web;no=")
    fireEvent.click(screen.getByRole("button", { name: "exercises.filter.clearField Теги" }))
    expect(screen.getByTestId("state")).toHaveTextContent("yes=;no=")
  })

  it("shows the cycle hint only on a так/ні list", () => {
    render(<Controlled options={STATUSES} />)
    fireEvent.focus(screen.getByRole("combobox"))
    expect(screen.queryByText("exercises.filter.tags.cycleHint")).not.toBeInTheDocument()
    expect(screen.getByRole("listbox")).not.toHaveAttribute("aria-describedby")
  })

  it("keeps its list above the sticky table header", () => {
    render(<Controlled options={STATUSES} />)
    fireEvent.focus(screen.getByRole("combobox"))
    expect(screen.getByRole("listbox").parentElement).toHaveClass("z-[80]")
  })
})
