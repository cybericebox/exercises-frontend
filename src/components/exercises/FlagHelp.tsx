"use client"

import { HelpCircle } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

const codeClass = "rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"

export function FlagHelp() {
  const description = [
    t("admin.exTask.flag.sectionFormat"),
    t("admin.exTask.flag.allowedCharacters"),
    t("admin.exTask.flag.help"),
    t("admin.exTask.flag.modeFixed"),
    t("admin.exTask.flag.fixedHelp"),
    t("admin.exTask.flag.modeTemplate"),
    t("admin.exTask.flag.templateRules"),
    t("admin.exTask.flag.templateCodes"),
    t("admin.exTask.flag.templateSetRules"),
    t("admin.exTask.flag.templateExclusionRules"),
    t("admin.exTask.flag.escapeRules"),
    t("admin.exTask.flag.templateClassEscapeRules"),
    t("admin.exTask.flag.example") + ": ICE{\\d[A-C]} → ICE{0A}",
    t("admin.exTask.flag.sectionSelection"),
    t("admin.exTask.flag.weightHelp"),
    t("admin.exTask.flag.selectionExample"),
  ].join("\n")

  return <HoverTooltip text={description} content={
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
        <p className="text-muted-foreground">{t("admin.exTask.flag.example")}: <code className={codeClass}>{"ICE{\\d[A-C]}"}</code> → <code className={codeClass}>{"ICE{0A}"}</code></p>
      </section>

      <section className="space-y-1 border-t border-border pt-2">
        <h3 className="font-semibold text-foreground">{t("admin.exTask.flag.sectionSelection")}</h3>
        <p>{t("admin.exTask.flag.weightHelp")}</p>
        <p className="text-muted-foreground">{t("admin.exTask.flag.selectionExample")}</p>
      </section>
    </div>
  }>
    <button type="button" aria-label={description} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </HoverTooltip>
}
