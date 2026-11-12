import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))
vi.mock("@/api/exercises/files", () => ({ uploadExerciseAttachment: vi.fn(async (_id: string | null, file: File) => ({ FileID: "f-1", Name: file.name, Size: file.size })) }))

import { MainSection } from "./MainSection"
import { InitSection } from "./InitSection"
import { ResourcesConfigProvider } from "../../../ResourcesConfigContext"
import { RESOURCES_CONFIG } from "@/test/resourcesConfig"
import { capabilities, device, draftWith, FormHarness, readValues, Values } from "../test/harness"
import type { DeviceFormValues } from "@/lib/exerciseSchemas"

const PATH = "Variants.0.Topology.Devices.0"

function renderMain(overrides: Partial<DeviceFormValues> = {}, props: { disabled?: boolean; imageDisabled?: boolean; linked?: boolean; caps?: ReturnType<typeof capabilities> } = {}) {
  render(<ResourcesConfigProvider value={RESOURCES_CONFIG}>
    <FormHarness draft={draftWith([device(overrides)])} caps={props.caps ?? null}>
      <MainSection variantIndex={0} deviceIndex={0} disabled={props.disabled ?? false} linkedBaseIndex={props.linked ? 0 : undefined} imageDisabled={props.imageDisabled} />
      <Values path={PATH} />
    </FormHarness>
  </ResourcesConfigProvider>)
}

describe("«Основне»", () => {
  it("edits the name and lets the profile be chosen from a dropdown with an explanation each", () => {
    renderMain()
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.main.name/ }), { target: { value: "api" } })
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.main.profile/ }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3)
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.profile.microvm/ }))
    expect(readValues()).toMatchObject({ Name: "api", Profile: "microvm" })
  })

  it("drops the persistence of a device that becomes a microVM", () => {
    renderMain({ Persistence: { Enabled: true, Debounce: "5s" } })
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.main.profile/ }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.profile.microvm/ }))
    expect(readValues()).toMatchObject({ Profile: "microvm", Persistence: { Enabled: false, Debounce: "" } })
  })

  it("keeps an unavailable profile visible and disabled with the reason", () => {
    renderMain({}, { caps: capabilities({ Profiles: { container: "all", microvm: "none", vm: "none" } }) })
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.main.profile/ }), { key: "ArrowDown" })
    const microvm = screen.getByRole("menuitemradio", { name: /ed.c.profile.microvm/ })
    expect(microvm).toHaveAttribute("aria-disabled", "true")
    expect(microvm).toHaveTextContent("ed.ui.lab.none")
    expect(screen.getByRole("menuitemradio", { name: /ed.c.profile.vm/ })).toHaveTextContent("ed.c.profile.soon")
  })

  it("offers only the platform's security profiles and shows the stored default when empty", () => {
    renderMain()
    expect(screen.getByRole("button", { name: /ed.c.main.security/ })).toHaveTextContent("admin.exTopo.security.standard")
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.main.security/ }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2)
    fireEvent.click(screen.getByRole("menuitemradio", { name: /extended/ }))
    expect(readValues()).toMatchObject({ SecurityPreset: "extended" })
  })

  it("shows the resource sizes of the platform and tags the ones above the frame", () => {
    renderMain()
    fireEvent.keyDown(screen.getByRole("button", { name: "ed.c.main.resources" }), { key: "ArrowDown" })
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(RESOURCES_CONFIG.Presets.length)
    expect(document.querySelectorAll("[data-needs-approval]").length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("menuitemradio", { name: /exercises.res.preset.medium/ }))
    expect(readValues()).toMatchObject({ ResourcePreset: "medium" })
  })

  it("keeps only the image editable in a linked variant", () => {
    renderMain({}, { disabled: true, imageDisabled: false, linked: true })
    expect(screen.getByRole("textbox", { name: /ed.c.main.name/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /ed.c.main.profile/ })).toBeDisabled()
    expect(screen.getByPlaceholderText("admin.exTopo.imagePlaceholder")).toBeEnabled()
  })
})

function renderInit(overrides: Partial<DeviceFormValues> = {}, disabled = false) {
  render(<FormHarness draft={draftWith([device(overrides)])} validate>
    <InitSection variantIndex={0} deviceIndex={0} disabled={disabled} requestVariable={() => {}} />
    <Values path={`${PATH}.Bootstrap`} />
  </FormHarness>)
}

describe("«Ініціалізація»", () => {
  it("shows no «no files» text and adds a text file with the path, owner, group and mode", () => {
    renderInit()
    expect(screen.queryByText(/ed.c.init.empty/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.init.addFile" }))
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.init.path/ }), { target: { value: "/srv/app.conf" } })
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.init.mode/ }), { target: { value: "0644" } })
    fireEvent.change(screen.getByLabelText("ed.c.init.contentN 1"), { target: { value: "hello" } })
    expect(readValues()).toMatchObject({ Files: [{ Path: "/srv/app.conf", From: "text", Content: "hello", Mode: "0644", Source: null }] })
  })

  it("uploads a chosen file as the content, keeps its name and refuses a file over 256 KiB", async () => {
    renderInit()
    fireEvent.click(screen.getByRole("button", { name: "ed.c.init.addFile" }))
    fireEvent.keyDown(screen.getByRole("button", { name: /ed.c.init.content$/ }), { key: "ArrowDown" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ed.c.init.sourceFile/ }))
    const input = document.querySelector<HTMLInputElement>('[data-file-row] input[type="file"]')!
    const big = new File([new Uint8Array(256 * 1024 + 1)], "big.bin")
    Object.defineProperty(input, "files", { value: [big], configurable: true })
    fireEvent.change(input)
    expect(await screen.findByText(/ed.c.init.fileTooBig big.bin/)).toBeInTheDocument()
    const small = new File(["x"], "notes.txt")
    Object.defineProperty(input, "files", { value: [small], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(readValues()).toMatchObject({ Files: [{ From: "file", Source: { FileID: "f-1", Name: "notes.txt" }, Path: "/srv/notes.txt" }] }))
  })

  it("turns a dropped file into a file row", async () => {
    const { container } = render(<FormHarness draft={draftWith([device()])}>
      <InitSection variantIndex={0} deviceIndex={0} disabled={false} requestVariable={() => {}} /><Values path={`${PATH}.Bootstrap`} />
    </FormHarness>)
    fireEvent.drop(container.querySelector("#init-files")!.parentElement!, { dataTransfer: { types: ["Files"], files: [new File(["abc"], "seed.sql")] } })
    await waitFor(() => expect(readValues()).toMatchObject({ Files: [{ From: "file", Source: { Name: "seed.sql" } }] }))
  })

  it("counts the lines of the script without the closing line break", () => {
    renderInit({ Bootstrap: { Timeout: "", Env: [], Files: [], Script: "echo a\n", Interpreter: "" } })
    expect(screen.getByText(/ed.c.init.lines.one 1/)).toBeInTheDocument()
  })

  it("writes the script, the interpreter and the time limit", () => {
    renderInit()
    fireEvent.change(screen.getByRole("textbox", { name: "ed.c.init.script" }), { target: { value: "echo hi" } })
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.init.interpreter/ }), { target: { value: "/bin/bash" } })
    fireEvent.change(screen.getByRole("textbox", { name: /ed.c.init.timeout/ }), { target: { value: "30s" } })
    expect(readValues()).toMatchObject({ Script: "echo hi", Interpreter: "/bin/bash", Timeout: "30s" })
  })

  it("shows a file path error beside the path", async () => {
    renderInit({ Bootstrap: { Timeout: "", Env: [], Script: "", Interpreter: "", Files: [{ Path: "relative", From: "text", Content: "", Source: null, Owner: "", Group: "", Mode: "" }] } })
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const path = await screen.findByRole("textbox", { name: /ed.c.init.path/ })
    await waitFor(() => expect(path).toHaveAttribute("aria-invalid", "true"))
  })

  it("ties a script error to the script field (invalid and described by its message)", async () => {
    renderInit({ Bootstrap: { Timeout: "", Env: [], Script: "x".repeat(70000), Interpreter: "", Files: [] } })
    fireEvent.click(screen.getByRole("button", { name: "validate-all" }))
    const script = await screen.findByRole("textbox", { name: "ed.c.init.script" })
    await waitFor(() => expect(script).toHaveAttribute("aria-invalid", "true"))
    const message = document.getElementById(script.getAttribute("aria-describedby") ?? "")
    expect(message).not.toBeNull()
    expect(message?.textContent).toContain("ed.c.val.scriptBytes")
  })

  it("has no add button when read-only", () => {
    renderInit({}, true)
    expect(screen.queryByRole("button", { name: "ed.c.init.addFile" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "ed.c.init.script" })).toBeDisabled()
  })
})
