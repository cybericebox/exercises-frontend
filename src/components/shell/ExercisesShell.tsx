"use client"
import { useEffect } from "react"
import { TopBar } from "./TopBar"
import { BannerStack } from "./BannerStack"
import { ReturnBar } from "./ReturnBar"
import { ReturnContextProvider } from "./ReturnContext"
import { useRole } from "@/lib/useRole"
import { t } from "@/i18n/t"
import { PageLoader } from "@/components/ui/spinner"
import { idOrigin, mainOrigin } from "@/lib/origins"

// Permission that opens the catalog. Phase 2 widens this with per-user rights.
export const CATALOG_PERMISSION = "exercises.read"

export function ExercisesShell({ children }: { children: React.ReactNode }) {
  const { role, isLoading, can } = useRole()

  useEffect(() => {
    if (!isLoading && role === null) {
      window.location.assign(`${idOrigin}/sign-in?return_to=${encodeURIComponent(window.location.href)}`)
    }
  }, [isLoading, role])

  if (isLoading) {
    return <PageLoader label={t("admin.loading")} />
  }

  // Not authenticated → bounce to id sign-in with return_to.
  if (role === null) {
    return null
  }

  // Authenticated without catalog rights → no-access panel (do NOT loop to sign-in).
  if (!can(CATALOG_PERMISSION)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="frost-panel frost-in max-w-md rounded-lg p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{t("admin.noAccess.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("exercises.noAccess.body")}</p>
          <a className="mt-4 inline-block text-sm text-primary hover:underline"
             href={mainOrigin}>{t("admin.noAccess.backToMain")}</a>
        </div>
      </div>
    )
  }

  return (
    <ReturnContextProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <TopBar />
        <ReturnBar />
        <BannerStack />
        <main className="min-h-0 flex-1 overflow-auto bg-background p-4 md:p-6">{children}</main>
      </div>
    </ReturnContextProvider>
  )
}
