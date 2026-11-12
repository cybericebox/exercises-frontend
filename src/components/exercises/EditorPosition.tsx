"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { DEFAULT_EDITOR_POSITION, type EditorPosition } from "@/lib/editorPosition"
import { fieldId } from "./editor/fieldErrors"

type PositionContextValue = {
  position: EditorPosition
  onChange: <K extends keyof EditorPosition>(key: K, value: EditorPosition[K]) => void
}

const PositionContext = createContext<PositionContextValue | null>(null)

export function EditorPositionProvider({ position, onChange, children }: PositionContextValue & { children: React.ReactNode }) {
  return <PositionContext.Provider value={{ position, onChange }}>{children}</PositionContext.Provider>
}

/** Shares one in-memory position between the parts of an editor that has no persisted position. */
export function SharedEditorPosition({ children }: { children: React.ReactNode }) {
  const context = useContext(PositionContext)
  const [position, setPosition] = useState<EditorPosition>(DEFAULT_EDITOR_POSITION)
  if (context) return <>{children}</>
  return <EditorPositionProvider position={position} onChange={(key, value) => setPosition((current) => ({ ...current, [key]: value }))}>{children}</EditorPositionProvider>
}

/** Existing draft editors remain self-contained; the new editor opts into persistence. */
export function useEditorPosition<K extends keyof EditorPosition>(key: K): [EditorPosition[K], (value: EditorPosition[K]) => void] {
  const context = useContext(PositionContext)
  const [local, setLocal] = useState<EditorPosition[K]>(DEFAULT_EDITOR_POSITION[key])
  return [context ? context.position[key] : local, (value) => {
    if (context) context.onChange(key, value)
    else setLocal(value)
  }]
}

/** How long a field is waited for after the editor switched to the view that holds it (a lazily mounted view, a dialog). */
const FOCUS_WAIT_MS = 1500

/**
 * Focus after the editor has revealed the tab/panel containing a validation error: the control whose id is the field's
 * (`fieldId(path)`), else the control with that `name`, else the first invalid one. The view may mount a moment later (a
 * tab, a collapsed condition, a dialog), so the lookup repeats for a short time, then the field is scrolled to the middle.
 */
export function useEditorValidationFocus() {
  const formRef = useRef<HTMLFormElement>(null)
  const [request, setRequest] = useState<{ path: string; id: number } | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!request) return
    const started = Date.now()
    let timer = 0
    const visible = (field: HTMLElement) => !field.closest('[data-state="inactive"], [hidden]')
    const find = (): HTMLElement | null => {
      const byId = document.getElementById(fieldId(request.path))
      if (byId && visible(byId)) return byId
      const root: ParentNode = formRef.current ?? document
      const fields = Array.from(root.querySelectorAll<HTMLElement>("[name], [data-field-name]"))
      return fields.find((field) => (field.getAttribute("name") ?? field.getAttribute("data-field-name")) === request.path && visible(field)) ?? null
    }
    const attempt = () => {
      const target = find() ?? (Date.now() - started > FOCUS_WAIT_MS ? (formRef.current ?? document).querySelector<HTMLElement>('[aria-invalid="true"]') : null)
      if (target) {
        target.scrollIntoView({ block: "center" })
        target.focus({ preventScroll: true })
        setRequest(null)
        return
      }
      if (Date.now() - started > FOCUS_WAIT_MS) { setRequest(null); return }
      timer = window.setTimeout(attempt, 50)
    }
    timer = window.setTimeout(attempt, 0)
    return () => window.clearTimeout(timer)
  }, [request])

  return {
    formRef,
    focusField: (path: PropertyKey[]) => setRequest({ path: path.join("."), id: ++requestId.current }),
  }
}
