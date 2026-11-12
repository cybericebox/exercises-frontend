import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { describe, expect, it } from "vitest"
import { FieldError, useErrorsAt } from "./fieldErrors"

type Values = { Items: { Name: string }[] }

function Late() {
  const errors = useErrorsAt("Items") as { 0?: { Name?: { message?: string } } }
  return <p data-testid="late">{errors[0]?.Name?.message ?? "none"}<FieldError path="Items.0.Name" /></p>
}

function Host() {
  const form = useForm<Values>({ defaultValues: { Items: [{ Name: "" }] } })
  const [show, setShow] = useState(false)
  return <FormProvider {...form}>
    <button type="button" onClick={() => form.setError("Items.0.Name", { type: "server", message: "from server" })}>place</button>
    <button type="button" onClick={() => setShow(true)}>reveal</button>
    {show && <Late />}
  </FormProvider>
}

describe("live field errors", () => {
  it("shows an error placed before the reader mounted (a row that was not on screen)", async () => {
    render(<Host />)
    fireEvent.click(screen.getByText("place"))
    fireEvent.click(screen.getByText("reveal"))
    expect(await screen.findByTestId("late")).toHaveTextContent("from server")
    expect(screen.getByRole("alert")).toHaveTextContent("from server")
  })
})
