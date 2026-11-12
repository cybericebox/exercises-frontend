"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import type { Exercise } from "@/api/exercises/catalog"
import type { GeneralStatus } from "../ExerciseGeneralMetadata"
import type { Version, VersionResources } from "@/api/exercises/versions"
import type { DeviceSection, EditorPosition, InfraView } from "@/lib/editorPosition"
import type { EditorIssue } from "@/lib/editor/issues"
import type { DraftFormValues, IdentityFormValues } from "@/lib/exerciseSchemas"
import { useEditorPosition } from "../EditorPosition"

/** Where a view can send the user. The shell switches the tab, the variant and the sub-view; the view focuses its field. */
export type EditorTarget =
  | { tab: "general" }
  | { tab: "variants" }
  | { tab: "tasks"; variant?: number; task?: number; condition?: number }
  | { tab: "infrastructure"; variant?: number; view?: InfraView; node?: string; section?: DeviceSection }

/** Dialogs the editor area hosts (inside the form, so they can read it). The exercise-level ones live in ExercisePage. */
export type EditorDialogName = "wizard" | "document" | "issues"

/** What the «Загальне» view needs from the page (the identity form is separate from the draft form). */
export type EditorPageData = {
  identityForm: UseFormReturn<IdentityFormValues>
  exercise: Exercise | null
  publishedVersion: Version | null
  publishedAt: string | null
  eventName: (id: string) => string | undefined
  /** The status the facts panel shows (see lib/catalogList headerStatus). */
  status: GeneralStatus
  resources: VersionResources | null
  usageEvents: string[]
  autoFocusName: boolean
  /** Viewing, not editing: values show as read-only text. */
  viewing: boolean
}

export type EditorApi = {
  /** The draft form (also available through FormProvider inside the editor area). */
  form: UseFormReturn<DraftFormValues>
  exerciseId: string | null
  variantIndex: number
  variantCount: number
  /** Position of the base variant of the current one, -1 when it is independent. */
  baseIndex: number
  selectVariant: (index: number) => void
  /** The editor is read-only (viewing, archived, a published version, no right to write, busy). */
  disabled: boolean
  /** The owner event forbids lab infrastructure: the infrastructure view is replaced by a note. */
  infrastructureBlocked: boolean
  /** The internal notes are for full access only. */
  showNotes: boolean
  /** The task's resources button, beside the infrastructure actions. */
  resources: ReactNode
  page: EditorPageData
  goTo: (target: EditorTarget) => void
  /** Opens the tab, variant and sub-view that hold the field at a form path, then focuses it. */
  goToField: (path: PropertyKey[]) => void
  dialog: EditorDialogName | null
  openDialog: (name: EditorDialogName) => void
  closeDialog: () => void
  /** The add-variant wizard (opened by the variant dropdown). */
  openWizard: () => void
  /** The list of invalid fields behind the issues dialog. */
  issues: IssuesState | null
  /** Opens «Перед публікацією виправте» (publish) or «Тест може не запуститися» (test; `onRunAnyway` starts it anyway). */
  showIssues: (issues: EditorIssue[], mode?: IssuesMode, onRunAnyway?: () => void) => void
}

export type IssuesMode = "publish" | "test"
export type IssuesState = { issues: EditorIssue[]; mode: IssuesMode; onRunAnyway?: () => void }

const EditorContext = createContext<EditorApi | null>(null)

/** The editor's api; only inside EditorProvider. */
export function useEditor(): EditorApi {
  const value = useContext(EditorContext)
  if (!value) throw new Error("useEditor must be used inside EditorProvider")
  return value
}

/** The api when there is one (small shared pieces that also render outside the editor, e.g. in tests). */
export function useOptionalEditor(): EditorApi | null {
  return useContext(EditorContext)
}

export type EditorProviderProps = {
  form: UseFormReturn<DraftFormValues>
  exerciseId: string | null
  disabled: boolean
  infrastructureBlocked: boolean
  showNotes: boolean
  resources?: ReactNode
  page: EditorPageData
  /** Navigates to the field at a form path and focuses it (ExercisePage owns the position and the focus). */
  onGoToField: (path: PropertyKey[]) => void
  /** Gives the code above the provider (the page's publish check) the editor's api. */
  apiRef?: MutableRefObject<EditorApi | null>
  children: ReactNode
}

/** Gives the header, the tab row and every view one api; wraps the whole page, so the «…» menu reaches the dialogs too. */
export function EditorProvider({ form, exerciseId, disabled, infrastructureBlocked, showNotes, resources, page, onGoToField, apiRef, children }: EditorProviderProps) {
  const [variant, setVariant] = useEditorPosition("variant")
  const [, setTab] = useEditorPosition("tab")
  const [, setTask] = useEditorPosition("task")
  const [, setCondition] = useEditorPosition("condition")
  const [, setInfraView] = useEditorPosition("infraView")
  const [, setOpenNode] = useEditorPosition("openNode")
  const [, setDeviceSection] = useEditorPosition("deviceSection")
  const [dialog, setDialog] = useState<EditorDialogName | null>(null)
  const [issues, setIssues] = useState<IssuesState | null>(null)
  // Only the link structure of ALL variants, as one string: a keystroke inside a variant leaves it equal (no re-render),
  // and nothing here closes over the current variant, so a change of the current variant is always seen (useWatch's
  // `compute` is not re-run when only its closure changes).
  const links = useWatch({ control: form.control, name: "Variants", compute: (variants: DraftFormValues["Variants"]) => JSON.stringify(variants.map((v) => [v.ID, v.LinkedTo])) })
  const pairs = useMemo(() => JSON.parse(links) as [string, string][], [links])
  const variantCount = pairs.length
  const variantIndex = Math.min(variant, Math.max(variantCount - 1, 0))
  const baseIndex = useMemo(() => {
    const linkedTo = pairs[variantIndex]?.[1]
    return linkedTo ? pairs.findIndex(([id]) => id !== "" && id === linkedTo) : -1
  }, [pairs, variantIndex])

  const selectVariant = useCallback((index: number) => setVariant(index), [setVariant])
  const goTo = useCallback((target: EditorTarget) => {
    setTab(target.tab)
    if (target.tab === "tasks") {
      if (target.variant !== undefined) setVariant(target.variant)
      if (target.task !== undefined) setTask(target.task)
      if (target.condition !== undefined) setCondition(target.condition)
    }
    if (target.tab === "infrastructure") {
      if (target.variant !== undefined) setVariant(target.variant)
      if (target.view) setInfraView(target.view)
      if (target.node !== undefined) setOpenNode(target.node)
      if (target.section) setDeviceSection(target.section)
    }
  }, [setTab, setVariant, setTask, setCondition, setInfraView, setOpenNode, setDeviceSection])
  const openDialog = useCallback((name: EditorDialogName) => setDialog(name), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const openWizard = useCallback(() => setDialog("wizard"), [])
  const showIssues = useCallback((list: EditorIssue[], mode: IssuesMode = "publish", onRunAnyway?: () => void) => {
    setIssues({ issues: list, mode, onRunAnyway })
    setDialog("issues")
  }, [])

  const value = useMemo<EditorApi>(() => ({
    form, exerciseId, variantIndex, variantCount, baseIndex, selectVariant, disabled, infrastructureBlocked, showNotes, resources, page,
    goTo, goToField: onGoToField, dialog, openDialog, closeDialog, openWizard, issues, showIssues,
  }), [form, exerciseId, variantIndex, variantCount, baseIndex, selectVariant, disabled, infrastructureBlocked, showNotes, resources, page, goTo, onGoToField, dialog, openDialog, closeDialog, openWizard, issues, showIssues])
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = value
    return () => { apiRef.current = null }
  }, [apiRef, value])
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export type { EditorPosition }
