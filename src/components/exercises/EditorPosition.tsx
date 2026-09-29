"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { DEFAULT_EDITOR_POSITION, type EditorPosition } from "@/lib/editorPosition"

type PositionContextValue = {
  position: EditorPosition
  onChange: <K extends keyof EditorPosition>(key: K, value: EditorPosition[K]) => void
}

const PositionContext = createContext<PositionContextValue | null>(null)

export function EditorPositionProvider({ position, onChange, children }: PositionContextValue & { children: React.ReactNode }) {
  return <PositionContext.Provider value={{ position, onChange }}>{children}</PositionContext.Provider>
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

/** Focus after the editor has revealed the tab/panel containing a validation error. */
export function useEditorValidationFocus() {
  const formRef = useRef<HTMLFormElement>(null)
  const [request, setRequest] = useState<{ path: string; id: number } | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!request) return
    const timer = window.setTimeout(() => {
      const fields = Array.from(formRef.current?.querySelectorAll<HTMLElement>("[name]") ?? [])
      const visible = (field: HTMLElement) => !field.closest('[data-state="inactive"], [hidden]')
      const target = fields.find((field) => field.getAttribute("name") === request.path && visible(field))
        ?? fields.find((field) => field.getAttribute("aria-invalid") === "true" && visible(field))
      target?.focus()
      setRequest(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [request])

  return {
    formRef,
    focusField: (path: PropertyKey[]) => setRequest({ path: path.join("."), id: ++requestId.current }),
  }
}
