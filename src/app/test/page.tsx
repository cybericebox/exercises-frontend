"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ErrorPage } from "@/components/ErrorPage"
import { TestLabPage } from "@/components/exercises/TestLabPage"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"

function TestRoute() {
  const params = useSearchParams()
  const exercise = params.get("exercise") ?? ""
  const deploy = params.get("deploy") || null
  const version = params.get("version") || null
  const variant = params.get("variant") || null
  if (!exercise || (!deploy && !(version && variant))) return <ErrorPage mode="page" status={404} title={t("admin.exTest.notFound")} />
  // The page swaps ?version&variant for ?deploy once the lab is created; it keeps what it opened with.
  return <TestLabPage key={exercise} exerciseId={exercise} initial={{ deploy, version, variant }} />
}

export default function Page() {
  return <Suspense fallback={<LoadingArea className="h-full" label={t("admin.loading")} />}>
    <TestRoute />
  </Suspense>
}
