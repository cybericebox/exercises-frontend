import { screen } from "@testing-library/react"

/** The «?» help button whose description (aria-describedby text) matches; FieldHelp is named «Довідка», not by its text. */
export function helpButton(text: string | RegExp): HTMLElement {
  const match = screen.getAllByRole("button").filter((button) => {
    const description = document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent
    return description !== undefined && description !== null && (typeof text === "string" ? description === text : text.test(description))
  })
  if (match.length !== 1) throw new Error(`expected one help button for ${String(text)}, found ${match.length}`)
  return match[0]
}
