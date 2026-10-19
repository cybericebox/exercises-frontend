"use client"

import { Label } from "@/components/ui/label"
import { SelectMenu } from "@/components/ui/select-menu"
import { t } from "@/i18n/t"
import { durationLabel } from "@/lib/durations"
import type { TestRunLengths } from "@/api/exercises/deploy"

/** The length offered first: the server's default when it is one of the choices, else 1 h, else the shortest. */
export function initialLength(lengths: TestRunLengths): number {
  const allowed = lengths.AllowedMinutes
  if (allowed.includes(lengths.DefaultMinutes)) return lengths.DefaultMinutes
  if (allowed.includes(60)) return 60
  return allowed[0] ?? lengths.DefaultMinutes
}

/** The run length of a test laboratory: the lab is deleted after it unless it is extended. */
export function TestRunLength({ lengths, value, onChange, disabled }: {
  lengths: TestRunLengths
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}) {
  return <div className="grid gap-1.5">
    <Label htmlFor="test-run-length">{t("admin.exDeploy.length")}</Label>
    <SelectMenu id="test-run-length" ariaLabel={t("admin.exDeploy.length")} value={String(value)} disabled={disabled}
      options={lengths.AllowedMinutes.map((m) => ({ value: String(m), label: durationLabel(m) }))}
      aria-describedby="test-run-length-hint" onChange={(next) => onChange(Number(next))} />
    <p id="test-run-length-hint" className="text-xs text-muted-foreground">{t("admin.exDeploy.lengthHint")}</p>
  </div>
}
