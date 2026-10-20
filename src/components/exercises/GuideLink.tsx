import Link from "next/link"
import { BookOpen } from "lucide-react"
import { guideHref, type GuideSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

/** Registered guide destinations, with context-specific accessible names. */
export function GuideLink({ topic, iconOnly = false }: { topic: GuideSlug; iconOnly?: boolean }) {
  if (iconOnly) return <HoverTooltip text={t(`admin.exGuide.${topic}`)} describe>
    <Link href={guideHref(topic)} aria-label={t(`admin.exGuide.${topic}`)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <BookOpen aria-hidden="true" className="h-5 w-5" />
    </Link>
  </HoverTooltip>
  return <Link href={guideHref(topic)} className="inline-flex shrink-0 items-center gap-1 rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{t(`admin.exGuide.${topic}`)}
  </Link>
}
