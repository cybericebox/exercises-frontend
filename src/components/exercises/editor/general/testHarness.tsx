import { useRef, useState, type ReactNode } from "react"
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form"
import { DEFAULT_EDITOR_POSITION } from "@/lib/editorPosition"
import type { DraftFormValues, VariantFormValues } from "@/lib/exerciseSchemas"
import { emptyDraft } from "@/lib/exerciseSchemas"
import { EditorPositionProvider } from "../../EditorPosition"
import { EditorProvider, useEditor, type EditorApi, type EditorPageData } from "../context"

/** Renders children inside the editor context with a draft of the given variants; `onReady` receives the form and the api. */
export function EditorHarness({ variants, disabled = false, showNotes = true, exerciseId = "ex1", onGoToField, onReady, children }: {
  variants: VariantFormValues[]
  disabled?: boolean
  showNotes?: boolean
  exerciseId?: string | null
  onGoToField?: (path: PropertyKey[]) => void
  onReady?: (form: UseFormReturn<DraftFormValues>, api: EditorApi, position: typeof DEFAULT_EDITOR_POSITION) => void
  children: ReactNode
}) {
  const form = useForm<DraftFormValues>({ defaultValues: { ...emptyDraft(), Variants: variants } })
  const apiRef = useRef<EditorApi | null>(null)
  const [position, setPosition] = useState(DEFAULT_EDITOR_POSITION)
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>
    <FormProvider {...form}>
      <EditorProvider form={form} exerciseId={exerciseId} disabled={disabled} infrastructureBlocked={false} showNotes={showNotes} page={{} as EditorPageData} onGoToField={onGoToField ?? (() => undefined)} apiRef={apiRef}>
        <Spy onReady={(api) => onReady?.(form, api, position)} />
        {children}
      </EditorProvider>
    </FormProvider>
  </EditorPositionProvider>
}

function Spy({ onReady }: { onReady: (api: EditorApi) => void }) {
  onReady(useEditor())
  return null
}
