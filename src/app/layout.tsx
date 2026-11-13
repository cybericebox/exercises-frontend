import "./globals.css"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { RoleProvider } from "@/lib/useRole"
import { ExercisesShell } from "@/components/shell/ExercisesShell"
import { ServiceStatusGate } from "@/components/ServiceStatusGate"
import { ChunkRecovery } from "@/components/ChunkRecovery"
import { CHUNK_RECOVERY_BOOT_SCRIPT } from "@/lib/chunkRecovery"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"
import { ToastProvider } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { FixtureGate } from "@/components/dev/FixtureGate"
import { Analytics } from "@/components/consent/Analytics"
import { settingsAttrs } from "@/lib/settings"

// noindex also as a meta tag: static hosts (GitHub Pages) cannot send X-Robots-Tag.
export const metadata = { title: t("exercises.meta.title"), description: t("exercises.meta.description"), robots: { index: false, follow: false } }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${GeistSans.variable} ${GeistMono.variable}`} data-scroll-behavior="smooth" {...settingsAttrs()} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_BOOT_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} /></head>
      {/* Browser extensions can add attributes to body before React hydrates. */}
      <body className="grid-bg" suppressHydrationWarning>
        <ChunkRecovery />
        {/* dimmed and inert behind the «server unavailable» overlay */}
        <div data-app-root>
          <FixtureGate>
            <RoleProvider>
              <ToastProvider><ExercisesShell>{children}</ExercisesShell></ToastProvider>
            </RoleProvider>
          </FixtureGate>
        </div>
        <ServiceStatusGate />
        {/* the consent panel is always mounted («Налаштування файлів cookie»); GA loads only when configured */}
        <Analytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} />
      </body>
    </html>
  )
}
