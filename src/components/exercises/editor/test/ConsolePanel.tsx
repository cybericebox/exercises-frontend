"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Terminal, X } from "lucide-react"

import { ApiError } from "@/api/client"
import { openDeployLink } from "@/api/exercises/deploy"
import { Button } from "@/components/ui/button"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { LoadError } from "@/components/ui/load-error"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { isConsoleFrameUrl } from "@/lib/consoleFrame"
import { exerciseErrorMessage } from "@/lib/exerciseErrors"

/** The console page of a lab device did not show within this long: the frame is treated as blocked. */
export const CONSOLE_FRAME_TIMEOUT_MS = 15000
/** The device has no console in this lab: the lab has no web address to name its base domain (33518) or no such device. */
const NO_CONSOLE_CODE = 33518

type LinkState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "none" }
  | { kind: "failed"; cause: unknown }

/** The console link of one device: a short-lived single-use address of the page the lab serves under its own domain. */
function useConsoleLink(deployId: string, device: string, allowed: boolean, attempt: number): LinkState {
  // The answer belongs to the request that asked: another device or attempt reads as loading until its own answer arrives.
  const requestId = `${deployId}|${device}|${attempt}`
  const [result, setResult] = useState<{ requestId: string; state: LinkState } | null>(null)
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    // The port is ignored for the console.
    openDeployLink(deployId, device, 0, "terminal").then(
      (link) => { if (!cancelled) setResult({ requestId, state: { kind: "ready", url: link.URL } }) },
      (cause) => {
        if (cancelled) return
        const missing = cause instanceof ApiError && (cause.status === 404 || cause.code === NO_CONSOLE_CODE)
        setResult({ requestId, state: missing ? { kind: "none" } : { kind: "failed", cause } })
      },
    )
    return () => { cancelled = true }
  }, [deployId, device, allowed, requestId])
  if (!allowed) return { kind: "none" }
  return result?.requestId === requestId ? result.state : { kind: "loading" }
}

/** Opens the console in a tab of its own. The tab is opened inside the click, so the browser lets it through. */
export function useOpenConsoleTab(deployId: string) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const open = useCallback((device: string) => {
    const tab = window.open("about:blank", "_blank")
    if (!tab) { setError(new Error("popup")); return }
    tab.opener = null
    setBusy(true)
    setError(null)
    openDeployLink(deployId, device, 0, "terminal").then(
      (link) => { tab.location.href = link.URL },
      (cause) => { tab.close(); setError(cause) },
    ).finally(() => setBusy(false))
  }, [deployId])
  return { open, busy, error, clear: () => setError(null) }
}

/**
 * The console of a device inside the page: a frame with a header (device name, «Відкрити в новій вкладці», close). The
 * console page itself, its terminal and its file upload and download, belong to the laboratory; here it is only embedded.
 * It loads only when the laboratory allows this site as an ancestor of the frame and both share the registrable domain;
 * when it cannot (blocked, no console in the lab, the link refused) the panel says so with a way to the new tab, never a
 * blank frame.
 */
export function ConsolePanel({ deployId, device, allowed, reason, onClose, className }: {
  deployId: string
  device: string
  /** The laboratories can run a console at all (the capabilities); false: no link is asked for. */
  allowed: boolean
  /** Why not, when `allowed` is false. */
  reason: string
  onClose: () => void
  className?: string
}) {
  const [attempt, setAttempt] = useState(0)
  const link = useConsoleLink(deployId, device, allowed, attempt)
  const tab = useOpenConsoleTab(deployId)
  // Only the console origin of the labs goes into a frame; any other address is offered as a new tab.
  const refused = link.kind === "ready" && !isConsoleFrameUrl(link.url)
  const url = link.kind === "ready" && !refused ? link.url : null
  // What happened to the frame of this address: it loaded, or nothing came within the time.
  const [frame, setFrame] = useState<{ url: string | null; loaded: boolean; timedOut: boolean }>({ url: null, loaded: false, timedOut: false })
  const loaded = frame.url === url && frame.loaded
  const timedOut = frame.url === url && frame.timedOut
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!url) return
    const timer = setTimeout(() => setFrame((current) => current.url === url && current.loaded ? current : { url, loaded: false, timedOut: true }), CONSOLE_FRAME_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [url])

  const retry = () => setAttempt((n) => n + 1)
  const newTab = <Button type="button" variant="outline" busy={tab.busy} busyLabel={t("ed.d.console.opening")} onClick={() => tab.open(device)}>
    <ExternalLink aria-hidden="true" size={16} className="mr-1.5" />{t("ed.d.console.newTab")}
  </Button>
  const failedFrame = link.kind === "ready" && !refused && timedOut && !loaded

  let body: React.ReactNode
  if (link.kind === "loading") body = <LoadingArea className="h-full" label={t("ed.d.console.loading")} message={t("ed.d.console.loading")} />
  else if (link.kind === "none") body = <LoadError className="h-full" message={t("ed.d.console.none", { device })} help={reason || t("ed.d.console.noneHelp")} />
  else if (link.kind === "failed") body = <LoadError className="h-full" message={t("ed.d.console.failed", { device })} help={exerciseErrorMessage(link.cause)} error={link.cause} onRetry={retry} actions={newTab} />
  else if (refused) body = <LoadError className="h-full" message={t("ed.d.console.blocked", { device })} help={t("ed.d.console.blockedHelp")} actions={newTab} />
  else body = <>
    {/* sandbox: scripts and the lab's own origin (its cookies) are needed by the console page; forms carry the file upload,
        downloads the file download. No top navigation, no popups, no modals. clipboard-*: copy and paste in the terminal.
        The referrer carries this site's origin, which the lab checks against its list of allowed ancestors. */}
    {/* eslint-disable-next-line @eslint-react/dom-no-unsafe-iframe-sandbox -- the console page is served from the labs domain, a
        different origin from this site, so allow-same-origin only keeps its own cookies and storage; it cannot reach this page. */}
    <iframe title={t("ed.d.console.frame", { device })} src={link.url} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
      allow="clipboard-read; clipboard-write" referrerPolicy="origin" onLoad={() => setFrame({ url, loaded: true, timedOut: false })}
      className={failedFrame ? "hidden" : "h-full w-full border-0 bg-background"} />
    {!loaded && !timedOut && <LoadingArea className="absolute inset-0 bg-background" label={t("ed.d.console.loading")} message={t("ed.d.console.loading")} />}
    {failedFrame && <LoadError className="h-full" message={t("ed.d.console.blocked", { device })} help={t("ed.d.console.blockedHelp")} onRetry={retry} actions={newTab} />}
  </>

  return <section aria-label={t("ed.d.console.region", { device })} className={className ?? "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"}>
    <header className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Terminal aria-hidden="true" size={16} className="shrink-0 text-muted-foreground" />
      <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">{device}</h3>
      <HoverTooltip text={t("ed.d.console.newTab")}>
        <span><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("ed.d.console.newTab")} disabled={tab.busy || !allowed} onClick={() => tab.open(device)}><ExternalLink aria-hidden="true" size={16} /></Button></span>
      </HoverTooltip>
      <HoverTooltip text={t("ed.d.console.close")}>
        <Button ref={closeRef} type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t("ed.d.console.close")} onClick={onClose}><X aria-hidden="true" size={16} /></Button>
      </HoverTooltip>
    </header>
    <div className="relative h-[26rem] min-h-0 md:h-[32rem]">{body}</div>
    {/* A frame the laboratory refuses to be embedded in still "loads" (the browser shows its own error page inside), and a page
        of another origin cannot be inspected: so the way out is always at hand, not only when a failure is detected. */}
    {link.kind === "ready" && <p className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span>{t("ed.d.console.notShown")}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={tab.busy || !allowed} onClick={() => tab.open(device)}>{t("ed.d.console.newTab")}</Button>
    </p>}
    {tab.error !== null && <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">
      {tab.error instanceof Error && tab.error.message === "popup" ? t("ed.d.console.popup") : exerciseErrorMessage(tab.error)}
    </p>}
  </section>
}
