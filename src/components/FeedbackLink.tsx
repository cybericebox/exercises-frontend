"use client"

import type { ComponentPropsWithRef } from "react"
import { usePathname } from "next/navigation"
import { t } from "@/i18n/t"
import { feedbackHref } from "@/lib/feedback"
import "./feedback-link.css"

// A plain <a href="mailto:…"> that sits in the footer (or the account menu): it is part of the server-rendered /
// static HTML, so it works without JavaScript. usePathname still renders on the static pass (the path of the page
// being built). `app` overrides the app name in the subject; the rest of the props pass through, so a menu item
// can wrap it with `asChild` (className, ref, children).
export function FeedbackLink({ app, children, ...rest }: { app?: string } & Omit<ComponentPropsWithRef<"a">, "href">) {
  const pathname = usePathname() || "/"
  const subject = t("feedback.subject", { app: app ?? t("feedback.app"), page: pathname })
  return (
    <a {...rest} href={feedbackHref(subject)} suppressHydrationWarning>
      {children ?? t("feedback.link")}
    </a>
  )
}
