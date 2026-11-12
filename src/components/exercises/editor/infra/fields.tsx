"use client"

import type { ReactNode } from "react"
import { Controller, useFormContext, type FieldPath } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu"
import { FieldLabel } from "@/components/ui/field-label"
import type { HelpContent } from "@/components/ui/help-content"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { cn } from "@/utils/cn"
import { FieldError, fieldProps, useFieldError } from "../fieldErrors"

export type FormPath = string
const asPath = (path: FormPath) => path as FieldPath<DraftFormValues>

/** `Variants.0.Topology` of a variant. */
export const topologyPath = (variantIndex: number) => `Variants.${variantIndex}.Topology`
/** `Variants.0.Topology.Devices.2` of a device. */
export const devicePath = (variantIndex: number, deviceIndex: number) => `${topologyPath(variantIndex)}.Devices.${deviceIndex}`

type LabelProps = { label: string; required?: boolean; help?: HelpContent; helpText?: string }

/** A text control bound to a form path: label (asterisk, «?»), the control, and its error beside it. */
export function InputField({ name, label, required, help, helpText, placeholder, disabled, mono, type = "text", className, maxLength, inputMode, onValue, autoComplete = "off" }: LabelProps & {
  name: FormPath
  placeholder?: string
  disabled?: boolean
  mono?: boolean
  type?: "text" | "number"
  className?: string
  maxLength?: number
  inputMode?: "numeric" | "text"
  /** Called with every typed value, after the form took it. */
  onValue?: (value: string) => void
  autoComplete?: string
}) {
  const { control } = useFormContext<DraftFormValues>()
  const error = useFieldError(name)
  const props = fieldProps(name, error)
  return <div className={cn("min-w-0", className)}>
    <FieldLabel text={label} required={required} htmlFor={props.id} help={help} helpText={helpText} className="mb-1" />
    <Controller control={control} name={asPath(name)} render={({ field }) => <Input {...props} ref={field.ref} name={field.name} value={String(field.value ?? "")} disabled={disabled} placeholder={placeholder} maxLength={maxLength}
      inputMode={inputMode} type={type} autoComplete={autoComplete} spellCheck={false} className={cn(mono && "font-mono text-[13px]")}
      onBlur={field.onBlur} onChange={(event) => { field.onChange(event.target.value); onValue?.(event.target.value) }} />} />
    <FieldError path={name} />
  </div>
}

/** A dropdown bound to a form path (one of many: the filled dot, in the reserved left column). */
export function SelectField({ name, label, required, help, helpText, options, disabled, className, menuClassName, onValue, placeholder, emptyAs }: LabelProps & {
  name: FormPath
  options: SelectMenuOption[]
  disabled?: boolean
  className?: string
  menuClassName?: string
  onValue?: (value: string) => void
  placeholder?: string
  /** The option shown while the stored value is empty (the stored default). */
  emptyAs?: string
}) {
  const { control } = useFormContext<DraftFormValues>()
  const error = useFieldError(name)
  const props = fieldProps(name, error)
  return <div className={cn("min-w-0", className)}>
    <FieldLabel text={label} required={required} htmlFor={props.id} help={help} helpText={helpText} className="mb-1" />
    <Controller control={control} name={asPath(name)} render={({ field }) => <SelectMenu {...props} ariaLabel={label} value={String(field.value || emptyAs || "")} options={options} disabled={disabled} placeholder={placeholder}
      className="w-full" menuClassName={menuClassName} onChange={(value) => { field.onChange(value); onValue?.(value) }} />} />
    <FieldError path={name} />
  </div>
}

/** A multi-line code text bound to a form path. */
export function TextAreaField({ name, label, required, help, helpText, placeholder, disabled, rows = 5, className }: LabelProps & {
  name: FormPath
  placeholder?: string
  disabled?: boolean
  rows?: number
  className?: string
}) {
  const { control } = useFormContext<DraftFormValues>()
  const error = useFieldError(name)
  const props = fieldProps(name, error)
  return <div className={cn("min-w-0", className)}>
    <FieldLabel text={label} required={required} htmlFor={props.id} help={help} helpText={helpText} className="mb-1" />
    <Controller control={control} name={asPath(name)} render={({ field }) => <Textarea {...props} ref={field.ref} name={field.name} value={String(field.value ?? "")} rows={rows} disabled={disabled} placeholder={placeholder} wrap="off" spellCheck={false}
      className="font-mono text-[13px]" onBlur={field.onBlur} onChange={(event) => field.onChange(event.target.value)} />} />
    <FieldError path={name} />
  </div>
}

/** A titled block of a dialog section: the heading (with a count and an action on the right) and its body. */
export function Block({ title, count, actions, children, id, help }: { title: string; count?: number | string; actions?: ReactNode; children: ReactNode; id?: string; help?: HelpContent }) {
  return <section id={id} aria-label={title} className="min-w-0 space-y-2">
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", actions && "min-h-8")}>
      <FieldLabel as="h4" text={title} help={help} className="min-h-0" labelClassName="font-semibold">
        {count !== undefined && count !== 0 && count !== "" && <span className="ml-1.5 text-sm font-normal text-muted-foreground">· {count}</span>}
      </FieldLabel>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
}

/** A grid of fields of standard widths: one column on a phone, two from a wide dialog. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 @md:grid-cols-2", className)}>{children}</div>
}
