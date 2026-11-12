"use client"

import type { ReactNode } from "react"
import { Eye } from "lucide-react"

import type { NormalizedHint } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { t } from "@/i18n/t"

/** Hints of a task in catalog order, each collapsed as «Підказка N · level» with an eye button that shows it. */
export function HintList({ hints, revealed, onReveal, render }: {
  hints: { hint: NormalizedHint; index: number }[]
  revealed: ReadonlySet<string>
  onReveal: (id: string) => void
  render: (text: string) => ReactNode
}) {
  return <section>
    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("exercises.hints.title")}</h3>
    <ol className="mt-2 space-y-2">
      {hints.map(({ hint, index }) => {
        const id = hint.ID || String(index)
        const open = revealed.has(id)
        return <li key={id} className="rounded-md border border-border p-3 dark:border-[var(--ib-control)]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("exercises.hints.itemLine", { n: index + 1, level: t(`exercises.hints.level.${hint.Level}`) })}</span>
            {!open && <HoverTooltip text={t("ed.d.hint.show")}>
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={t("ed.d.hint.showNamed", { n: index + 1 })} onClick={() => onReveal(id)}>
                <Eye aria-hidden="true" size={16} />
              </Button>
            </HoverTooltip>}
          </div>
          {open && <div className="mt-2 max-h-36 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary" tabIndex={0}>{render(hint.Text)}</div>}
        </li>
      })}
    </ol>
  </section>
}
