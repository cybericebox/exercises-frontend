"use client"

import { useState } from "react"
import { t } from "@/i18n/t"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"

/**
 * SecretInput — write-only secret value.
 * Backend contract: Value is empty in responses, HasValue=true if a value is
 * stored; an empty Value on save means "keep the stored value". Therefore:
 *  - hasValue && value === "" → "value is stored" label + a "Replace" button;
 *  - replace mode / new secret → a password input with a reveal toggle; leaving it empty is fine
 *    (the stored value is left unchanged).
 */
export function SecretInput({
  value,
  hasValue,
  onChange,
  disabled,
}: {
  value: string
  hasValue: boolean
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [replacing, setReplacing] = useState(false)
  const showStored = hasValue && !replacing && value === ""

  if (showStored) {
    return (
      <div className="flex h-9 items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("admin.exSecret.stored")}</span>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(true)}>
            {t("admin.exSecret.replace")}
          </Button>
        )}
      </div>
    )
  }

  return (
    <PasswordInput
      data-testid="secret-value-input"
      autoComplete="new-password"
      value={value}
      disabled={disabled}
      placeholder={hasValue ? t("admin.exSecret.keep") : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
