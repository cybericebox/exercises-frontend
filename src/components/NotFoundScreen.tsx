"use client"

import Link from "next/link"
import { SearchX } from "lucide-react"

import { Wordmark } from "@/components/brand/Wordmark"
import { goBack } from "@/components/ErrorScreen"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import { t } from "@/i18n/t"

const HOME = "/"

/**
 * «Page not found», the one screen of every frontend: brand lockup, muted SearchX mark,
 * title, one line, «На головну» and «Назад». No card. app/not-found.tsx renders it as a
 * full page; an in-page «item not found» state passes a context `title` and `block` to
 * center it in its own block instead.
 */
export function NotFoundScreen({ title = t("error.notFound"), body = t("error.notFoundDescription"), block = false }: { title?: string; body?: string; block?: boolean }) {
  return (
    <main className={cn("flex flex-col items-center justify-center gap-4 px-4 py-12 text-center", block ? "min-h-64 flex-1" : "min-h-screen")}>
      <Wordmark size="lg" href={null} />
      <SearchX size={32} className="text-muted-foreground" aria-hidden />
      <h1 className="max-w-md text-balance text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-muted-foreground">{body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild><Link href={HOME}>{t("error.goHome")}</Link></Button>
        <Button variant="outline" onClick={goBack}>{t("error.page.back")}</Button>
      </div>
    </main>
  )
}
