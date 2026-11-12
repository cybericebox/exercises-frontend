"use client"

import { CircleAlert } from "lucide-react"
import { get, useFormContext, type FieldErrors } from "react-hook-form"
import { cn } from "@/utils/cn"

/** The DOM id of the control of a form path: `Variants.0.Tasks.1.Name` -> `fe-Variants-0-Tasks-1-Name`. */
export function fieldId(path: string | PropertyKey[]): string {
  const text = typeof path === "string" ? path : path.map(String).join(".")
  return `fe-${text.replace(/[^A-Za-z0-9_-]+/g, "-")}`
}

const errorId = (path: string | PropertyKey[]) => `${fieldId(path)}-error`

/** The message of the error at a form path, or undefined. Re-renders only the field that reads it. */
export function useFieldError(path: string): string | undefined {
  const { formState: { errors } } = useFormContext()
  const error = get(errors, path) as { message?: unknown } | undefined
  return typeof error?.message === "string" && error.message !== "" ? error.message : undefined
}

/**
 * Props that tie a control to its error: the id the "go to the field" navigation finds, and `aria-invalid` +
 * `aria-describedby` while the field is wrong. `describedBy` keeps existing help references.
 */
export function fieldProps(path: string, error: string | undefined, describedBy?: string): { id: string; "aria-invalid": true | undefined; "aria-describedby": string | undefined } {
  const ids = [describedBy, error ? errorId(path) : undefined].filter(Boolean).join(" ")
  return { id: fieldId(path), "aria-invalid": error ? true : undefined, "aria-describedby": ids || undefined }
}

/** The error of a field, beside its control (never only at the end of the form, below a preview or in a toast). */
export function FieldError({ path, message, className }: { path: string; message?: string; className?: string }) {
  const own = useFieldError(path)
  const text = message ?? own
  if (!text) return null
  return <p id={errorId(path)} role="alert" className={cn("flex items-start gap-1.5 text-xs font-medium leading-4 text-destructive", className)}>
    <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" /><span>{text}</span>
  </p>
}

/** The path of the first error in a react-hook-form error tree (for the focus after a failed check), or null. */
export function firstErrorPath(errors: FieldErrors, prefix: string[] = []): string[] | null {
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") continue
    if ("message" in value && typeof (value as { message?: unknown }).message === "string" && (value as { type?: unknown }).type !== undefined) return [...prefix, key]
    const nested = firstErrorPath(value as FieldErrors, [...prefix, key])
    if (nested) return nested
  }
  return null
}
