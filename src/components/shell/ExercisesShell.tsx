"use client"
import { useEffect } from "react"
import { TopBar } from "./TopBar"
import { BannerStack } from "./BannerStack"
import { ReturnContextProvider } from "./ReturnContext"
import { useRole } from "@/lib/useRole"
import { t } from "@/i18n/t"
import { PageLoader } from "@/components/ui/spinner"
import { mainOrigin, signInURL } from "@/lib/origins"
import { hasCatalogAccess } from "@/lib/exerciseRights"
import { AccessProvider, useExerciseAccess } from "./AccessContext"

export function ExercisesShell({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useRole()

  useEffect(() => {
    if (!isLoading && role === null) {
      const url = signInURL(window.location.href)
      if (url) window.location.assign(url)
    }
  }, [isLoading, role])

  if (isLoading) {
    return <PageLoader label={t("admin.loading")} />
  }

  // Not authenticated → bounce to id sign-in with return_to.
  if (role === null) {
    return null
  }

  return <AccessProvider><AccessGate>{children}</AccessGate></AccessProvider>
}

function AccessGate({ children }: { children: React.ReactNode }) {
  const { access, loading } = useExerciseAccess()
  if (loading || !access) return <PageLoader label={t("admin.loading")} />

  // Neither admin nor an event member → no-access panel (do NOT loop to sign-in).
  if (!hasCatalogAccess(access)) {
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
        <BannerStack />
        <main className="min-h-0 flex-1 overflow-auto bg-background p-4 md:p-6">{children}</main>
      </div>
    </ReturnContextProvider>
  )
}
