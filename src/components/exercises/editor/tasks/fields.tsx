"use client"

import { useState, type ReactNode } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu"
import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"
import { FieldError, fieldId, fieldProps, useFieldError } from "../fieldErrors"
import { RefField } from "../kit/RefField"
import { cn } from "@/utils/cn"

/** A labelled control with its error beside it: label (asterisk, «?»), the control, the error line. */
export function Field({ path, label, required, help, children, className, htmlFor }: {
  /** Form path of the control: gives the label its `for`, the error its place. */
  path: string
  label: string
  required?: boolean
  help?: HelpContent
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return <div className={cn("min-w-0 space-y-1", className)}>
    <FieldLabel text={label} required={required} help={help} htmlFor={htmlFor ?? fieldId(path)} />
    {children}
    <FieldError path={path} />
  </div>
}

/** A single-line text bound to a form path; the error and `aria-*` are wired. */
export function TextControl({ path, disabled, mono, placeholder, ariaLabel, inputMode, maxLength, onValue, className }: {
  path: string
  disabled?: boolean
  mono?: boolean
  placeholder?: string
  ariaLabel?: string
  inputMode?: "numeric" | "text"
  maxLength?: number
  /** Called after the form took the value (keep other variants in step). */
  onValue?: (value: string) => void
  className?: string
}) {
  const { control } = useFormContext()
  const error = useFieldError(path)
  return <Controller control={control} name={path} render={({ field }) => (
    <Input {...fieldProps(path, error)} name={field.name} ref={field.ref} value={(field.value as string | undefined) ?? ""} disabled={disabled}
      placeholder={placeholder} aria-label={ariaLabel} inputMode={inputMode} maxLength={maxLength} spellCheck={false} autoComplete="off"
      className={cn(mono && "font-mono", className)} onBlur={field.onBlur}
      onChange={(event) => { field.onChange(event.target.value); onValue?.(event.target.value) }} />
  )} />
}

/** An expected-value field with the token picker (answers and schema variables by name). */
export function RefControl({ path, variantIndex, disabled, placeholder, ariaLabel, picker = true }: {
  path: string
  variantIndex: number
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  picker?: boolean
}) {
  const { control } = useFormContext()
  const error = useFieldError(path)
  return <Controller control={control} name={path} render={({ field }) => (
    <RefField {...fieldProps(path, error)} name={field.name} ref={field.ref} variantIndex={variantIndex} value={(field.value as string | undefined) ?? ""}
      onValueChange={field.onChange} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} picker={picker} onBlur={field.onBlur} />
  )} />
}

/** A one-of-many choice bound to a form path (the dot mark of the menu is the foundation's). */
export function ChoiceControl({ path, options, disabled, ariaLabel, className, value, onChoose }: {
  path: string
  options: SelectMenuOption[]
  disabled?: boolean
  ariaLabel: string
  className?: string
  /** Overrides the form value (a Tri field shows "yes" / "no" / ""). */
  value?: string
  /** Overrides the write (a Tri field stores true / false / null). */
  onChoose?: (value: string) => void
}) {
  const { control } = useFormContext()
  const error = useFieldError(path)
  return <Controller control={control} name={path} render={({ field }) => (
    <SelectMenu {...fieldProps(path, error)} value={value ?? String(field.value ?? "")} onChange={(next) => (onChoose ? onChoose(next) : field.onChange(next))}
      options={options} disabled={disabled} ariaLabel={ariaLabel} className={cn("w-full", className)} menuClassName="min-w-56" />
  )} />
}

/** A multi-line monospace text (a command). */
export function AreaControl({ path, disabled, placeholder, ariaLabel, rows = 3 }: { path: string; disabled?: boolean; placeholder?: string; ariaLabel?: string; rows?: number }) {
  const { control } = useFormContext()
  const error = useFieldError(path)
  return <Controller control={control} name={path} render={({ field }) => (
    <Textarea {...fieldProps(path, error)} name={field.name} ref={field.ref} rows={rows} wrap="off" value={(field.value as string | undefined) ?? ""} disabled={disabled}
      placeholder={placeholder} aria-label={ariaLabel} spellCheck={false} className="font-mono" onBlur={field.onBlur} onChange={(event) => field.onChange(event.target.value)} />
  )} />
}

const parseList = (text: string) => text.split(",").map((part) => part.trim()).filter(Boolean)

function ListInput({ list, onList, path, error, disabled, placeholder, ariaLabel, name, onBlur }: {
  list: string[]; onList: (list: string[]) => void; path: string; error: string | undefined; disabled?: boolean; placeholder?: string; ariaLabel?: string; name: string; onBlur: () => void
}) {
  const joined = list.join("\n")
  // The typed text is kept while the list it stands for does not change; an outside change (a reset) replaces it.
  const [state, setState] = useState({ text: list.join(", "), joined })
  if (state.joined !== joined && parseList(state.text).join("\n") !== joined) setState({ text: list.join(", "), joined })
  else if (state.joined !== joined) setState({ ...state, joined })
  return <Input {...fieldProps(path, error)} name={name} value={state.text} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} spellCheck={false} autoComplete="off"
    className="font-mono" onBlur={onBlur} onChange={(event) => { setState({ text: event.target.value, joined: parseList(event.target.value).join("\n") }); onList(parseList(event.target.value)) }} />
}

/** Names separated by commas, stored as a list. */
export function ListControl({ path, disabled, placeholder, ariaLabel }: { path: string; disabled?: boolean; placeholder?: string; ariaLabel?: string }) {
  const { control } = useFormContext()
  const error = useFieldError(path)
  return <Controller control={control} name={path} render={({ field }) => (
    <ListInput list={(field.value as string[] | undefined) ?? []} onList={field.onChange} path={path} error={error} disabled={disabled} placeholder={placeholder} ariaLabel={ariaLabel} name={field.name} onBlur={field.onBlur} />
  )} />
}
