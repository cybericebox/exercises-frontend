"use client"

import "./globals.css"
import { useEffect } from "react"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { ErrorScreen } from "@/components/ErrorScreen"
import { applyTheme, readThemeChoice, resolveTheme } from "@/lib/theme"
import { t } from "@/i18n/t"
import { FeedbackLink } from "@/components/FeedbackLink"

// Root layout failed: this replaces the whole document, so it brings its own <html>,
// global styles and the saved theme (cib_theme cookie).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // hydration keeps a server-rendered data-theme; set the saved theme after mount
    applyTheme(readThemeChoice())
    if (process.env.NODE_ENV !== "production") console.error(error)
  }, [error])

  // React never runs inline scripts it renders on the client, so the boot script cannot
  // be reused here: the saved theme is resolved while rendering.
  const theme = typeof document === "undefined" ? undefined : resolveTheme(readThemeChoice())

  return (
    <html lang="uk" data-theme={theme} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <title>{t("error.page.title")}</title>
      </head>
      <body className="grid-bg" suppressHydrationWarning>
        <ErrorScreen onRetry={retry} fullPage />
        {/* plain mailto link; the root layout (and its FeedbackLink) is gone here */}
        <FeedbackLink />
      </body>
    </html>
  )
}
