"use client"

import { useId, type ReactNode } from "react"
import { t } from "@/i18n/t"
import { Label } from "@/components/ui/label"
import { cn } from "@/utils/cn"

export interface FieldControlProps {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  "aria-required"?: boolean
}

/**
 * One field: label bound to the control, optional required mark, hint and inline
 * error. The control gets `aria-describedby` only for the ids that exist,
 * `aria-invalid` and `aria-required` through the render prop.
 */
export function Field({ label, required = false, hint, error, className, children }: {
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: (control: FieldControlProps) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
  return <div className={cn("space-y-1.5", className)}>
    <Label htmlFor={id}>
      {label}
      {required && <>
        <span className="ml-1 text-destructive" aria-hidden="true">*</span>
        <span className="sr-only">{t("admin.ex.field.required")}</span>
      </>}
    </Label>
    {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required || undefined })}
    {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{error}</p>}
  </div>
}
