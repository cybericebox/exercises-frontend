import "./globals.css"
import { GoogleAnalytics } from "@next/third-parties/google"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { RoleProvider } from "@/lib/useRole"
import { ExercisesShell } from "@/components/shell/ExercisesShell"
import { ServiceStatusGate } from "@/components/ServiceStatusGate"
import { THEME_BOOT_SCRIPT } from "@/lib/theme"
import { ToastProvider } from "@/components/ui/toast"

// noindex also as a meta tag: static hosts (GitHub Pages) cannot send X-Robots-Tag.
export const metadata = { title: "Каталог завдань · Cyber ICE Box", robots: { index: false, follow: false } }

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
        {process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID} />}
      </body>
    </html>
  )
}
