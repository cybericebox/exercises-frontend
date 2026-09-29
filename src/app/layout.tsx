import "./globals.css"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { RoleProvider } from "@/lib/useRole"
import { ExercisesShell } from "@/components/shell/ExercisesShell"
import { ServiceStatusGate } from "@/components/ServiceStatusGate"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"
import { ToastProvider } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { Analytics } from "@/components/consent/Analytics"

// noindex also as a meta tag: static hosts (GitHub Pages) cannot send X-Robots-Tag.
export const metadata = { title: t("exercises.meta.title"), description: t("exercises.meta.description"), robots: { index: false, follow: false } }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} /></head>
      {/* Browser extensions can add attributes to body before React hydrates. */}
      <body className="grid-bg" suppressHydrationWarning>
        <RoleProvider>
          <ToastProvider><ExercisesShell>{children}</ExercisesShell></ToastProvider>
        </RoleProvider>
        <ServiceStatusGate />
        {/* the consent panel is always mounted («Налаштування файлів cookie»); GA loads only when configured */}
        <Analytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} />
      </body>
    </html>
  )
}
