"use client"

import Link from "next/link"

import { CREST_SRC } from "@/components/brand/Logo"
import { FeedbackLink } from "@/components/FeedbackLink"
import { Button } from "@/components/ui/button"
import { errorCode } from "@/components/ui/load-error"
import { t } from "@/i18n/t"

const HOME = "/"

// Browser history back; a tab opened straight on the failing page goes home instead.
export function goBack() {
  if (window.history.length > 1) window.history.back()
  // a full load leaves the failed render state behind
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  else window.location.assign(HOME)
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
  const heading = title ?? (notFound ? t("error.notFound") : t("error.page.title"))
  const text = body ?? (notFound ? t("error.notFoundDescription") : t("error.page.body"))
  const code = notFound ? undefined : errorCode(error)
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
    {code !== undefined && <p className="ib-error__ref">{t("error.load.code", { code })}</p>}
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
