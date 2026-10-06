"use client"
import { usePathname } from "next/navigation"
import { TopBar } from "./TopBar"
import { SiteBanners } from "./SiteBanners"
import { ReturnContextProvider } from "./ReturnContext"
import { useRole } from "@/lib/useRole"
import { t } from "@/i18n/t"
import { PageLoader } from "@/components/ui/spinner"
import { NoAccessScreen } from "./NoAccessScreen"
import { SignInRedirect } from "./SignInRedirect"
import { hasCatalogAccess } from "@/lib/exerciseRights"
import { AccessProvider, useExerciseAccess } from "./AccessContext"

export function ExercisesShell({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useRole()

  if (isLoading) {
    return <PageLoader label={t("admin.loading")} />
  }

  // Not authenticated (401) → straight to the id sign-in with return_to, behind the loader.
  if (role === null) {
    return <SignInRedirect />
  }

  return <AccessProvider><AccessGate>{children}</AccessGate></AccessProvider>
}

// First focusable element of every shell: jumps past the top bar to <main id="main">.
function SkipLink() {
  return <a className="ib-skip" href="#main">{t("exercises.shell.skipToContent")}</a>
}

function AccessGate({ children }: { children: React.ReactNode }) {
  const { access, loading } = useExerciseAccess()
  const pathname = usePathname()
  if (loading || !access) return <PageLoader label={t("admin.loading")} />

  // Neither admin nor an event member (403) → the no-access screen (do NOT loop to sign-in).
  if (!hasCatalogAccess(access)) return <NoAccessScreen />

  // The lab testing page is full-screen on its own: none of the catalog chrome.
  if (pathname.startsWith("/test")) {
    return (
      <>
        <SkipLink />
        <main id="main" tabIndex={-1} className="h-dvh overflow-hidden bg-background">{children}</main>
      </>
    )
  }

  return (
    <ReturnContextProvider>
      <SkipLink />
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <TopBar />
        <SiteBanners />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-auto bg-background p-4 md:p-6">{children}</main>
      </div>
    </ReturnContextProvider>
  )
}
