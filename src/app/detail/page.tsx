"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ExerciseNotFound, ExercisePage } from "@/components/exercises/ExercisePage"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"

function DetailRoute() {
  const params = useSearchParams()
  const id = params.get("id") ?? ""
  const version = params.get("version") || null
  if (!id) return <ExerciseNotFound />
  // A new id/version is a new page state: remount instead of syncing every hook.
  return <ExercisePage key={`${id}:${version ?? ""}`} exerciseId={id} versionId={version} />
}

export default function Page() {
  return <Suspense fallback={<LoadingArea className="h-full" label={t("admin.loading")} />}>
    <DetailRoute />
  </Suspense>
}

