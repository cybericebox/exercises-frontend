"use client"

import { usePathname } from "next/navigation"
import { t } from "@/i18n/t"
import { feedbackHref } from "@/lib/feedback"
import "./feedback-link.css"

// A plain <a href="mailto:…"> on every page: it is part of the server-rendered / static HTML, so it works
// without JavaScript. usePathname still renders on the static pass (the path of the page being built).
// `app` overrides the app name in the subject (event sites pass the event name).
export function FeedbackLink({ app }: { app?: string }) {
  const pathname = usePathname() || "/"
  const subject = t("feedback.subject", { app: app ?? t("feedback.app"), page: pathname })
  return (
    <a className="feedback-link" href={feedbackHref(subject)} suppressHydrationWarning>
      {t("feedback.link")}
    </a>
  )
}
