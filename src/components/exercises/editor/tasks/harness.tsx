/**
 * A test harness for the subtask views: the editor provider with a real form (draft schema as the resolver), a position
 * store, and handles on the form and on the `goTo` / `goToField` calls. Used by the tests of this directory only.
 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { vi, type Mock } from "vitest"
import { render } from "@testing-library/react"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import { draftSchema, emptyDraft, emptyVariant, type DraftFormValues } from "@/lib/exerciseSchemas"
import { emptyCheck, emptyTask, type TaskFormValues } from "@/lib/editor/schemas/task"
import { emptyBootstrap, emptyDevice, type DeviceFormValues } from "@/lib/editor/schemas/infra"
import { EditorPositionProvider } from "../../EditorPosition"
import { ExerciseIdContext } from "../../ExerciseIdContext"
import { EditorProvider, useEditor, type EditorApi, type EditorPageData } from "../context"
import { LabCapabilitiesProvider } from "../labCapabilities"
import type { LabCapabilities } from "@/api/exercises/capabilities"

export type Handles = { form: UseFormReturn<DraftFormValues>; api: EditorApi | null; goToField: Mock<(path: PropertyKey[]) => void>; ready: (form: UseFormReturn<DraftFormValues>, api: EditorApi) => void }

export function task(key: string, name: string, overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return { ...emptyTask(key), Name: name, ...overrides }
}

export function flagTask(key: string, name: string, values: string[] = []): TaskFormValues {
  const t = task(key, name)
  t.Check = { ...emptyCheck("answer"), Kind: "answer", Answer: { ...emptyCheck("answer").Answer, Type: "flag", Values: values } }
  return t
}

export function node(id: string, name: string, bootstrap: Partial<DeviceFormValues["Bootstrap"]> = {}, access: DeviceFormValues["Access"] = []): DeviceFormValues {
  return { ...emptyDevice(), ID: id, Name: name, Access: access, Bootstrap: { ...emptyBootstrap(), ...bootstrap } }
}

export type HarnessOptions = {
  variants?: { tasks: TaskFormValues[]; devices?: DeviceFormValues[]; id?: string; linkedTo?: string; variables?: { Name: string; Kind: "value" | "template"; Text: string }[] }[]
  disabled?: boolean
  variantIndex?: number
  /** Skip the zod resolver (a test that only looks at values). */
  resolver?: boolean
  /** What the laboratories can run (default: unknown, nothing is disabled). */
  caps?: LabCapabilities
}

export function draftOf(options: HarnessOptions): DraftFormValues {
  const draft = emptyDraft()
  draft.Variants = (options.variants ?? [{ tasks: [flagTask("task_1", "First")] }]).map((spec, index) => {
    const variant = emptyVariant(index + 1)
    variant.ID = spec.id ?? `v${index + 1}`
    variant.LinkedTo = spec.linkedTo ?? ""
    variant.Tasks = spec.tasks
    variant.Topology = { ...variant.Topology, Devices: spec.devices ?? [], Variables: spec.variables ?? [] }
    return variant
  })
  return draft
}

/** Hands the form and the editor api to the test (a function made outside React, so it may write the holder). */
function Probe({ onReady }: { onReady: (form: UseFormReturn<DraftFormValues>, api: EditorApi) => void }) {
  const api = useEditor()
  useEffect(() => { onReady(api.form, api) })
  return null
}

function Providers({ options, handles, children }: { options: HarnessOptions; handles: Handles; children: ReactNode }) {
  const form = useForm<DraftFormValues>({ defaultValues: draftOf(options), resolver: options.resolver === false ? undefined : zodResolver(draftSchema), mode: "onChange" })
  const [position, setPosition] = useState({ ...DEFAULT_EDITOR_POSITION, tab: "tasks" as const, variant: options.variantIndex ?? 0 })
  const apiRef = useRef<EditorApi | null>(null)
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>
    <EditorProvider form={form} exerciseId="ex" disabled={Boolean(options.disabled)} infrastructureBlocked={false} showNotes={false} page={{} as EditorPageData}
      apiRef={apiRef} onGoToField={(path) => handles.goToField(path)}>
      <ExerciseIdContext.Provider value="ex"><LabCapabilitiesProvider value={options.caps ?? null}><FormProvider {...form}><Probe onReady={handles.ready} />{children}</FormProvider></LabCapabilitiesProvider></ExerciseIdContext.Provider>
    </EditorProvider>
  </EditorPositionProvider>
}

export function renderInEditor(ui: ReactNode, options: HarnessOptions = {}) {
  const handles: Handles = { form: null as never, api: null, goToField: vi.fn<(path: PropertyKey[]) => void>(), ready: (form, api) => { handles.form = form; handles.api = api } }
  const result = render(<Providers options={options} handles={handles}>{ui}</Providers>)
  return { ...result, handles, values: () => handles.form.getValues() }
}
