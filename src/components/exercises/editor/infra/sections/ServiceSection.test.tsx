import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { ServiceSection } from "./ServiceSection"
import { DevicePersistenceProvider } from "../../../DevicePersistenceContext"
import { device, draftWith, FormHarness, readValues, Values } from "../test/harness"
import type { DeviceFormValues } from "@/lib/exerciseSchemas"

const PATH = "Variants.0.Topology.Devices.0"

function renderService(overrides: Partial<DeviceFormValues> = {}, options: { disabled?: boolean; persistence?: boolean; path?: string } = {}) {
  const goVariables = vi.fn()
  render(<DevicePersistenceProvider value={options.persistence ?? true}>
    <FormHarness draft={draftWith([device(overrides)])} validate>
      <ServiceSection variantIndex={0} deviceIndex={0} disabled={options.disabled ?? false} onOpenVariables={goVariables} requestVariable={() => {}} />
      <Values path={options.path ?? `${PATH}.Bootstrap.Env`} />
    </FormHarness>
  </DevicePersistenceProvider>)
  return { goVariables }
}

const env = (name: string, value = "", extra: Partial<DeviceFormValues["Bootstrap"]["Env"][number]> = {}) => ({ Name: name, Value: value, Secret: false, HasValue: false, ...extra })
const withEnv = (...rows: ReturnType<typeof env>[]) => ({ Bootstrap: { Timeout: "", Env: rows, Files: [], Script: "", Interpreter: "" } })
const pickFile = (content: string) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File([content], ".env", { type: "text/plain" })
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
}

describe("environment variables", () => {
  it("adds a variable row with a masked value and an eye", () => {
    renderService()
    expect(screen.getByText("ed.c.env.empty")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.env.add" }))
    fireEvent.change(screen.getByRole("textbox", { name: "ed.c.env.nameN 1" }), { target: { value: "APP_MODE" } })
    fireEvent.change(screen.getByLabelText("ed.c.env.valueN 1"), { target: { value: "training" } })
    expect(screen.getByLabelText("ed.c.env.valueN 1")).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "ed.ui.showValue" }))
    expect(screen.getByLabelText("ed.c.env.valueN 1")).toHaveAttribute("type", "text")
    expect(readValues()).toMatchObject([{ Name: "APP_MODE", Value: "training", Secret: false }])
  })

  it("shows a saved secret as «Значення збережено» with a replace icon, and locks the toggle until a new value is typed", () => {
    renderService(withEnv(env("DB_PASS", "", { Secret: true, HasValue: true })))
    expect(screen.getByText("ed.c.env.stored")).toBeInTheDocument()
    const lock = screen.getByRole("button", { name: "ed.c.env.secretN 1" })
    expect(lock).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(lock)
    expect(readValues()).toMatchObject([{ Secret: true }])
    fireEvent.click(screen.getByRole("button", { name: "ed.c.env.replace" }))
    fireEvent.change(screen.getByTestId("secret-value-input"), { target: { value: "new-secret" } })
    expect(screen.getByRole("button", { name: "ed.c.env.secretN 1" })).not.toHaveAttribute("aria-disabled")
    expect(readValues()).toMatchObject([{ Name: "DB_PASS", Value: "new-secret", Secret: true, HasValue: true }])
  })

  it("keeps an untouched saved secret as it is: an empty value means «keep»", () => {
    renderService(withEnv(env("DB_PASS", "", { Secret: true, HasValue: true })))
    expect(readValues()).toMatchObject([{ Value: "", Secret: true, HasValue: true }])
  })

  it("lets a new secret be switched freely", () => {
    renderService(withEnv(env("TOKEN", "x")))
    const lock = screen.getByRole("button", { name: "ed.c.env.secretN 1" })
    fireEvent.click(lock)
    expect(readValues()).toMatchObject([{ Secret: true }])
    fireEvent.click(screen.getByRole("button", { name: "ed.c.env.secretN 1" }))
    expect(readValues()).toMatchObject([{ Secret: false }])
  })

  it("imports a .env file: new names become secrets, an existing name is updated after a confirmation", async () => {
    renderService(withEnv(env("MODE", "old")))
    pickFile("MODE=new\nTOKEN=abc\n")
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/ed.c.env.updateDescription MODE/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.env.update" }))
    await waitFor(() => expect(readValues()).toMatchObject([{ Name: "MODE", Value: "new" }, { Name: "TOKEN", Value: "abc", Secret: true }]))
    expect(screen.getByText(/ed.c.env.reportAdded 1/)).toBeInTheDocument()
  })

  it("replaces a saved secret only by a non-empty value from the file; an empty one keeps it", async () => {
    renderService(withEnv(env("DB_PASS", "", { Secret: true, HasValue: true })))
    pickFile("DB_PASS=\n")
    await waitFor(() => expect(screen.getByText(/ed.c.env.reportKept 1/)).toBeInTheDocument())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(readValues()).toMatchObject([{ Value: "", Secret: true, HasValue: true }])
    pickFile("DB_PASS=fresh\n")
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/ed.c.env.updateSecrets DB_PASS/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "ed.c.env.update" }))
    await waitFor(() => expect(readValues()).toMatchObject([{ Value: "fresh", Secret: true }]))
  })

  it("takes a .env file dropped on the block and ignores a drop while read-only", async () => {
    const { container } = render(<FormHarness draft={draftWith([device()])}>
      <ServiceSection variantIndex={0} deviceIndex={0} disabled={false} onOpenVariables={() => {}} requestVariable={() => {}} /><Values path={`${PATH}.Bootstrap.Env`} />
    </FormHarness>)
    const block = container.querySelector("[data-env-block]")!
    await act(async () => { fireEvent.drop(block, { dataTransfer: { types: ["Files"], files: [new File(["A=1"], ".env")] } }) })
    await waitFor(() => expect(readValues()).toMatchObject([{ Name: "A", Value: "1" }]))
  })

  it("stops adding at 64 variables with the reason", () => {
    renderService(withEnv(...Array.from({ length: 64 }, (_, index) => env(`V${index}`, "x"))))
    expect(screen.getByRole("button", { name: "ed.c.env.add" })).toHaveAttribute("aria-disabled", "true")
  })

  it("shows a name error beside the name of its own row", async () => {
    renderService(withEnv(env("1BAD", "x")))
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const name = await screen.findByRole("textbox", { name: "ed.c.env.nameN 1" })
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"))
    expect(document.getElementById(name.getAttribute("aria-describedby")!)).toHaveTextContent("ed.c.val.envName")
  })

  it("opens the schema variables through its link", () => {
    const { goVariables } = renderService()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.env.schemaVariables" }))
    expect(goVariables).toHaveBeenCalled()
  })
})

describe("service command and behavior", () => {
  it("turns the own command on with fields for the command and the arguments, and keeps quoted parts whole", () => {
    renderService({}, { path: PATH })
    expect(screen.getByText("ed.c.service.noImage")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.service.ownCommand" }))
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.service.command$/ }), { target: { value: "nginx" } })
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.service.args/ }), { target: { value: "-g 'daemon off;'" } })
    expect(readValues()).toMatchObject({ Command: ["nginx"], Args: ["-g", "daemon off;"] })
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.service.ownCommand" }))
    expect(readValues()).toMatchObject({ Command: [], Args: [] })
  })

  it("writes the readiness signal and the persistence with its delay", () => {
    renderService({}, { path: PATH })
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.service.ready" }))
    fireEvent.click(screen.getByRole("switch", { name: "ed.c.service.persist" }))
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.service.debounce/ }), { target: { value: "45s" } })
    expect(readValues()).toMatchObject({ WaitReadyFile: true, Persistence: { Enabled: true, Debounce: "45s" } })
  })

  it("keeps the persistence switch visible but disabled with the reason where the platform cannot keep state", () => {
    renderService({}, { persistence: false, path: PATH })
    expect(screen.getByRole("switch", { name: "ed.c.service.persist" })).toBeDisabled()
    expect(screen.getByText("ed.c.service.persistUnavailable")).toBeInTheDocument()
  })

  it("has no persistence switch, note or gap for a microVM or a VM, and shows it again for a container", () => {
    renderService({ Profile: "microvm" })
    expect(screen.queryByRole("switch", { name: "ed.c.service.persist" })).not.toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "ed.c.service.ready" })).toBeInTheDocument()
    cleanup()
    renderService({ Profile: "container" })
    expect(screen.getByRole("switch", { name: "ed.c.service.persist" })).not.toBeChecked()
  })

  it("is read-only when disabled", () => {
    renderService(withEnv(env("A", "1")), { disabled: true })
    expect(screen.getByRole("switch", { name: "ed.c.service.ownCommand" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "ed.c.env.nameN 1" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "ed.c.env.add" })).not.toBeInTheDocument()
  })
})
