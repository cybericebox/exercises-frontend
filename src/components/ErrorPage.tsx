"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Copy } from "lucide-react"

import { CREST_SRC } from "@/components/brand/Logo"
import { FeedbackLink } from "@/components/FeedbackLink"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { feedbackHref } from "@/lib/feedback"

const HOME = "/"

// Browser history back; a tab opened straight on the failing page goes home instead.
export function goBack() {
  if (window.history.length > 1) window.history.back()
  // a full load leaves the failed render state behind
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  else window.location.assign(HOME)
}

type ApiFailure = { code?: number; status: number; requestId?: string }

// The API error behind a failure (the error itself or its `cause`); a frontend crash has none.
function apiFailure(error: unknown): ApiFailure | null {
  for (const candidate of [error, (error as { cause?: unknown } | null | undefined)?.cause]) {
    if (!candidate || typeof candidate !== "object") continue
    const { code, status, requestId } = candidate as { code?: unknown; status?: unknown; requestId?: unknown }
    if (typeof status === "number" && status > 0) {
      return { status, code: typeof code === "number" ? code : undefined, requestId: typeof requestId === "string" && requestId ? requestId : undefined }
    }
  }
  return null
}

// «{code}-{rid8}»: platform error code and the first 8 hex chars of the request id; the code alone when the header is not readable.
function reference(failure: ApiFailure): string | undefined {
  const code = failure.code ?? failure.status
  const rid = failure.requestId?.replace(/-/g, "").slice(0, 8)
  return rid ? `${code}-${rid}` : undefined
}

// Prefilled mailto of «Повідомити деталі»: no personal data beyond what the user types.
function reportHref(failure: ApiFailure | null, error: unknown): string {
  if (typeof window === "undefined") return feedbackHref(t("error.page.report"))   // prerender: the client render fills the details
  const app = t("feedback.app")
  const lines = [t("error.report.url", { url: window.location.href }), t("error.report.time", { time: new Date().toISOString() })]
  let subject: string
  if (failure) {
    const ref = reference(failure) ?? String(failure.code ?? failure.status)
    subject = t("error.report.subject", { ref })
    lines.push(t("error.report.ref", { ref }))
  } else {
    subject = t("error.report.subjectCrash", { app })
    const message = error instanceof Error ? error.message : String(error ?? "")
    if (message) lines.push(t("error.report.message", { message: message.slice(0, 200) }))
    lines.push(t("error.report.app", { app, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "" }))
  }
  return feedbackHref(subject, [...lines, "", t("error.report.did"), ""].join("\n"))
}

function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return <>
    <button type="button" className="inline-flex size-6 items-center justify-center rounded-md text-[var(--ib-faint)] hover:text-[var(--ib-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ib-action)]"
      aria-label={t("error.page.copy")} title={t("error.page.copy")}
      onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined) }}>
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
    <span role="status" aria-live="polite" className="sr-only">{copied ? t("error.page.copied") : ""}</span>
  </>
}

/**
 * The one screen for every error and not-found state (DS patterns/error-page): big muted status code, title,
 * one line, actions and, for an error that carries a platform code, the faint «Код помилки» line.
 * `page`: the shell could not render (global error, a page outside the shell), centred in the viewport with
 * the thin footer. `block`: the shell is already there and only the page failed; the same column fills the
 * content area, no footer, no crest. A failed list or table keeps its small LoadError instead.
 */
export function ErrorPage({ mode, status, title, body, error, onRetry, home = status === 404 }: {
  mode: "page" | "block"
  /** HTTP-like status shown as the big code. */
  status: 404 | 500
  title?: string
  body?: string
  /** The failure; its numeric code (when it has one) shows as «Код помилки: {code}». */
  error?: unknown
  /** «Спробувати ще раз»; omit when retrying makes no sense. */
  onRetry?: () => void
  /** «На головну» as the primary action (default for 404). */
  home?: boolean
}) {
  const notFound = status === 404
  const failure = notFound ? null : apiFailure(error)
  const heading = title ?? (notFound ? t("error.notFound") : t("error.page.title"))
  const text = body ?? (notFound ? t("error.notFoundDescription") : failure ? t("error.page.reported") : t("error.page.body"))
  const ref = failure ? reference(failure) : undefined
  const code = failure ? failure.code ?? failure.status : undefined
  const Title = mode === "page" ? "h1" : "h2"
  const main = <>
    <p className="ib-error__code" aria-hidden="true">{status}</p>
    <Title className="ib-error__title">{heading}</Title>
    <p className="ib-error__text">{text}</p>
    <div className="ib-error__actions">
      {home && <Button asChild><Link href={HOME}>{t("error.goHome")}</Link></Button>}
      {onRetry && <Button onClick={onRetry}>{t("error.load.retry")}</Button>}
      <Button variant="link" className="h-auto p-0" onClick={goBack}>{t("error.page.back")}</Button>
    </div>
    {ref
      ? <p className="ib-error__ref">{t("error.page.ref", { ref })} <CopyRef value={ref} /></p>
      : code !== undefined && <p className="ib-error__ref">{t("error.load.code", { code })}</p>}
    {!notFound && <a className="text-sm text-[var(--ib-dim)] underline underline-offset-4 hover:text-[var(--ib-ink)]" href={reportHref(failure, error)} suppressHydrationWarning>{t("error.page.report")}</a>}
  </>

  if (mode === "block") {
    return <div className="ib-error ib-error--block ib-error--fill" role="alert"><div className="ib-error__main">{main}</div></div>
  }
  return (
    <div className="ib-error ib-error--page">
      <main className="ib-error__main" id="main" tabIndex={-1}>{main}</main>
      <footer className="ib-error__footer">
        <Link className="ib-error__brand" href={HOME}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CREST_SRC} width={18} height={18} alt="" />{t("app.brand")}
        </Link>
        <nav className="ib-error__links" aria-label={t("error.page.links")}>
          <Link href={HOME}>{t("error.goHome")}</Link>
          <FeedbackLink />
        </nav>
      </footer>
    </div>
  )
}
