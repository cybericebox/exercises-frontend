import Link from "next/link"
import { BookOpen } from "lucide-react"
import { guideHref, type GuideSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"

/**
 * A guide page as an icon with its name in a tooltip. «tool» stands in a row of buttons (bordered, the control
 * height); «inline» sits beside a heading or a field label (borderless, small); «dialog» stands next to a dialog's
 * close button and looks exactly like it (the same ghost icon button: colour, size, hover).
 */
export function GuideLink({ topic, variant = "inline", iconOnly = false }: { topic: GuideSlug; variant?: "tool" | "inline" | "dialog"; iconOnly?: boolean }) {
  const tool = variant === "tool" || iconOnly
  const label = t(`admin.exGuide.${topic}`)
  if (variant === "dialog") return <HoverTooltip text={label} describe>
    <Button asChild variant="ghost" size="icon"><Link data-dialog-guide href={guideHref(topic)} aria-label={label}><BookOpen aria-hidden="true" className="h-4 w-4" /></Link></Button>
  </HoverTooltip>
  return <HoverTooltip text={label} describe>
    <Link href={guideHref(topic)} aria-label={label} className={cn("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      tool ? "h-9 w-9 rounded-md border border-border bg-card hover:bg-accent pointer-coarse:h-11 pointer-coarse:w-11" : "h-7 w-7 rounded-sm hover:bg-accent pointer-coarse:h-11 pointer-coarse:w-11")}>
      <BookOpen aria-hidden="true" className="h-4 w-4" />
    </Link>
  </HoverTooltip>
}
