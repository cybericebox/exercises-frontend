import Link from "next/link"
import { BookOpen } from "lucide-react"
import { guideHref, type GuideSlug } from "@/content/guide/registry"
import { t } from "@/i18n/t"

/** Registered guide destinations, with context-specific accessible names. */
export function GuideLink({ topic }: { topic: GuideSlug }) {
  return <Link href={guideHref(topic)} className="inline-flex shrink-0 items-center gap-1 rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{t(`admin.exGuide.${topic}`)}
  </Link>
}
