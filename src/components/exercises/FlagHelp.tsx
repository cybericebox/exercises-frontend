"use client"

import { useRef } from "react"
import Link from "next/link"
import { HelpCircle } from "lucide-react"
import { t } from "@/i18n/t"
import { tRich } from "@/i18n/tRich"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

const codeClass = "rounded bg-muted px-1 py-0.5 font-mono text-2xs text-foreground"

export function FlagHelp() {
  const contentRef = useRef<HTMLDivElement>(null)
  return <Popover><PopoverTrigger asChild>
    <button type="button" aria-label={t("admin.exTask.flag.helpTitle")} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </PopoverTrigger><PopoverContent ref={contentRef} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus() }} aria-label={t("admin.exTask.flag.helpTitle")} className="w-[min(32rem,calc(100vw-1.5rem))] max-h-[min(36rem,80dvh)] p-4">
    <div className="w-full space-y-3 text-left normal-case tracking-normal">
      <section className="space-y-1">
        <h3 className="font-semibold text-foreground">{t("admin.exTask.flag.sectionFormat")}</h3>
        <p><code className={codeClass}>{"ICE{...}"}</code> {t("admin.exTask.flag.allowedCharacters")}</p>
        <p className="text-muted-foreground">{t("admin.exTask.flag.help")}</p>
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold text-foreground">{t("admin.exTask.flag.modeFixed")}</h3>
        <p>{t("admin.exTask.flag.fixedHelp")}</p>
      </section>

      <section className="space-y-1.5">
        <h3 className="font-semibold text-foreground">{t("admin.exTask.flag.modeTemplate")}</h3>
        <p>{t("admin.exTask.flag.templateRules")}</p>
        <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-2 gap-y-1">
          <dt><code className={codeClass}>{"\\d"}</code></dt><dd>{t("admin.exTask.flag.templateDigit")}</dd>
          <dt><code className={codeClass}>{"\\l"}</code></dt><dd>{t("admin.exTask.flag.templateLower")}</dd>
          <dt><code className={codeClass}>{"\\u"}</code></dt><dd>{t("admin.exTask.flag.templateUpper")}</dd>
        </dl>
        <p>{t("admin.exTask.flag.templateSetRules")} <code className={codeClass}>{"[A-Ce]"}</code></p>
        <p>{t("admin.exTask.flag.templateExclusionRules")} <code className={codeClass}>{"[\\d^13]"}</code></p>
        <p>{t("admin.exTask.flag.escapeRules")} <code className={codeClass}>{"\\["}</code> <code className={codeClass}>{"\\]"}</code> <code className={codeClass}>{"\\\\"}</code></p>
        <p>{t("admin.exTask.flag.templateClassEscapeRules")}</p>
        <p className="text-muted-foreground">{tRich("admin.exTask.flag.exampleMapping", { template: <code className={codeClass}>{"ICE{\\d[A-C]}"}</code>, result: <code className={codeClass}>{"ICE{0A}"}</code> })}</p>
      </section>

      <section className="space-y-1 border-t border-border pt-2">
        <h3 className="font-semibold text-foreground">{t("admin.exTask.flag.sectionSelection")}</h3>
        <p>{t("admin.exTask.flag.weightHelp")}</p>
        <p className="text-muted-foreground">{t("admin.exTask.flag.selectionExample")}</p>
      </section>

      <p><Link href="/guide/prapory/" className="font-medium text-primary underline underline-offset-2">{t("admin.exTask.flag.moreLink")}</Link></p>
    </div>
  </PopoverContent></Popover>
}
