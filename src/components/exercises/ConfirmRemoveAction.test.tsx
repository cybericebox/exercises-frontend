import { useState } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ConfirmRemoveAction } from "./ConfirmRemoveAction"
vi.mock("@/i18n/t", () => ({ t: (key: string) => key }))
it.each(["Cancel", "Escape"])("returns keyboard focus to the originating removal control after %s", async (method) => {
 render(<ConfirmRemoveAction ariaLabel="Remove" onClick={vi.fn()} />)
 const trigger = screen.getByRole("button", { name: "Remove" })
 act(() => trigger.focus()); fireEvent.click(trigger)
 if (method === "Cancel") fireEvent.click(screen.getByRole("button", { name: "confirm.cancel" }))
 else fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
 await waitFor(() => expect(trigger).toHaveFocus())
})
it("never tries to focus the deleted control after confirming removal", async () => {
 function Harness() { const [visible, setVisible] = useState(true); return visible ? <ConfirmRemoveAction ariaLabel="Remove" onClick={() => setVisible(false)} /> : <p>Removed</p> }
 render(<Harness />)
 const trigger = screen.getByRole("button", { name: "Remove" })
 const focus = vi.spyOn(trigger, "focus")
 fireEvent.click(trigger)
 fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }))
 await screen.findByText("Removed")
 expect(focus).not.toHaveBeenCalled()
})
