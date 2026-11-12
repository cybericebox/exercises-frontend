"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { MaskedInput } from "@/components/ui/masked-value"

/**
 * SecretInput — write-only secret value.
 * Backend contract: Value is empty in responses, HasValue=true if a value is
 * stored; an empty Value on save means "keep the stored value". Therefore:
 *  - hasValue && value === "" → «Значення збережено» and a replace icon button;
 *  - replace mode / new secret → a masked input with an eye; leaving it empty is fine
 *    (the stored value is left unchanged).
 */
export function SecretInput({
  value,
  hasValue,
  onChange,
  disabled,
  id,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
}: {
  value: string
  hasValue: boolean
  onChange: (v: string) => void
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-label"?: string
}) {
  const [replacing, setReplacing] = useState(false)
  const showStored = hasValue && !replacing && value === ""

  if (showStored) {
    return (
      <div id={id} className="flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm pointer-coarse:h-11">
        <span className="text-muted-foreground">{t("ed.c.env.stored")}</span>
        {!disabled && (
          <HoverTooltip text={t("ed.c.env.replace")}>
            <button type="button" aria-label={t("ed.c.env.replace")} onClick={() => setReplacing(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
          </HoverTooltip>
        )}
      </div>
    )
  }

  return (
    <MaskedInput
      id={id}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      aria-label={ariaLabel}
      data-testid="secret-value-input"
      autoComplete="new-password"
      autoFocus={replacing}
      value={value}
      disabled={disabled}
      placeholder={hasValue ? t("ed.c.env.keep") : t("ed.c.env.valuePlaceholder")}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
