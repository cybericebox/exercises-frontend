"use client"

import { forwardRef, useRef } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { Input } from "@/components/ui/input"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { fromDisplay, toDisplay } from "./refDisplay"
import { TaskRefPicker } from "./TaskRefPicker"

type RefFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  variantIndex: number
  /** The raw text (with `{{task.<key>}}` tokens). */
  value: string
  onValueChange: (raw: string) => void
  /** Show the «Вставити значення» button. */
  picker?: boolean
  mono?: boolean
}

/**
 * RefField — a text field for an expected value. It shows substitutions by name (`{{відповідь: Вхід}}`), keeps the raw
 * token in the form, and inserts a picked answer or variable at the caret.
 */
export const RefField = forwardRef<HTMLInputElement, RefFieldProps>(function RefField({ variantIndex, value, onValueChange, picker = true, mono = true, disabled, className, ...rest }, forwardedRef) {
  const { control } = useFormContext<DraftFormValues>()
  const tasks = useWatch({ control, name: `Variants.${variantIndex}.Tasks` }) ?? []
  const input = useRef<HTMLInputElement | null>(null)
  const caret = useRef<[number, number] | null>(null)
  const shown = toDisplay(value, tasks)
  const remember = () => { const node = input.current; if (node) caret.current = [node.selectionStart ?? node.value.length, node.selectionEnd ?? node.value.length] }
  function insert(token: string) {
    const [start, end] = caret.current ?? [shown.length, shown.length]
    const display = toDisplay(token, tasks)
    const next = shown.slice(0, start) + display + shown.slice(end)
    onValueChange(fromDisplay(next, tasks))
    const position = start + display.length
    caret.current = [position, position]
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(position, position) })
  }
  return <div className="relative flex min-w-0 items-center">
    <Input {...rest} ref={(node) => { input.current = node; if (typeof forwardedRef === "function") forwardedRef(node); else if (forwardedRef) forwardedRef.current = node }}
      value={shown} disabled={disabled} spellCheck={false} autoComplete="off"
      className={cn(mono && "font-mono", picker && !disabled && "pr-10", className)}
      onChange={(event) => onValueChange(fromDisplay(event.target.value, tasks))}
      onSelect={remember} onKeyUp={remember} onClick={remember} onBlur={remember} />
    {picker && !disabled && <span className="absolute right-0.5"><TaskRefPicker variantIndex={variantIndex} onPick={insert} /></span>}
  </div>
})
