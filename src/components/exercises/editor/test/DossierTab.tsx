"use client"

import { useEffect, useState } from "react"
import { Ban, Check, Copy } from "lucide-react"

import type { DeployDossier, DeployStatus, DossierLink } from "@/api/exercises/deploy"
import type { NormalizedTopology } from "@/api/exercises/versions"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { LoadError } from "@/components/ui/load-error"
import { MaskedText } from "@/components/ui/masked-value"
import { LoadingArea } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { consoleLineText, dossierTopology } from "@/lib/labConsole"
import type { DossierState } from "@/lib/useDossier"
import { SchemaView } from "./SchemaView"

/** A copy icon button with its own feedback (copied, or could not copy) said in its label and tooltip. */
export function CopyIconButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle")
  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), 1500)
    return () => window.clearTimeout(timer)
  }, [state])
  const shown = state === "copied" ? t("ed.d.dossier.copied") : state === "error" ? t("ed.d.dossier.copyFailed") : label
  return <HoverTooltip text={shown}>
    <button type="button" aria-label={shown} onClick={() => { void navigator.clipboard?.writeText(text).then(() => setState("copied"), () => setState("error")) }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--ib-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:h-11 pointer-coarse:w-11">
      {state === "copied" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
    </button>
  </HoverTooltip>
}

/** What is on the line, so the defender knows how to drive it. */
function kindText(link: DossierLink): string {
  if (link.ConsoleKind === "program") return t("ed.d.dossier.kind.program", { program: link.Program || "—" })
  if (link.ConsoleKind === "native") return t("ed.d.dossier.kind.native")
  return t("ed.d.dossier.kind.login")
}

/** The chip of a console line: up, or down with its reason (never colour alone: the words say it). */
export function LineChip({ up, label }: { up: boolean; label: string }) {
  return <Badge tone={up ? "ok" : "warn"} data-line={up ? "up" : "down"}>{label}</Badge>
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="min-w-0 space-y-2">
    <h3 id={id} className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
    {children}
  </section>
}

/**
 * The “Defender's dossier” tab of the test lab (console design 9a.3): the console map of the seat as a runbook (connect to the
 * device over serialN into its console port, and what answers there), the devices that are off-limits, the operator credentials
 * (masked, with show and copy) and the topology its mode allows (full: the schema, operates: only the operated devices, none).
 */
export function DossierTab({ dossier, topology, status, selected, onSelect }: {
  dossier: DossierState & { retry: () => void }
  topology: NormalizedTopology
  status: DeployStatus | null
  selected: string | null
  onSelect: (key: string | null) => void
}) {
  if (dossier.state === "idle" || dossier.state === "loading") return <LoadingArea className="min-h-0 flex-1" label={t("ed.d.dossier.loading")} />
  if (dossier.state === "error") return <LoadError className="min-h-0 flex-1" error={dossier.cause} message={t("ed.d.dossier.loadFailed")} onRetry={dossier.retry} />
  const data: DeployDossier = dossier.dossier
  const shown = dossierTopology(topology, data)
  const lineFor = (link: DossierLink) => status?.ConsoleCables?.find((cable) => cable.Console.Device === link.Device && cable.Console.Port === link.ConsolePort && cable.Serial.Port === link.SerialPort)
  return <div data-testid="dossier" className="flex min-w-0 flex-col gap-5">
    <p className="text-sm text-muted-foreground">{t("ed.d.dossier.intro")}</p>
    <Section id="dossier-links" title={t("ed.d.dossier.links")}>
      {data.Links.length === 0
        ? <EmptyState compact message={t("ed.d.dossier.noLinks")} />
        : <ol className="min-w-0 space-y-2">{data.Links.map((link) => {
          const line = lineFor(link)
          const command = t("ed.d.dossier.command", { path: link.Path })
          return <li key={link.SerialPort} data-dossier-link={link.SerialPort} className="min-w-0 space-y-1.5 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-foreground">{t("ed.d.dossier.runbook", { device: link.Device, serial: link.SerialPort, path: link.Path, console: link.ConsolePort })}</p>
              {line && <LineChip up={line.LineUp} label={consoleLineText(line)} />}
            </div>
            <p className="text-xs text-muted-foreground">{kindText(link)}</p>
            <div className="flex min-w-0 items-center gap-1 rounded-md bg-muted/40 pl-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{command}</code>
              <CopyIconButton text={command} label={t("ed.d.dossier.copyCommand", { command })} />
            </div>
          </li>
        })}</ol>}
    </Section>
    <Section id="dossier-forbidden" title={t("ed.d.dossier.forbidden")}>
      {data.Forbidden.length === 0
        ? <EmptyState compact message={t("ed.d.dossier.noForbidden")} />
        : <ul className="flex flex-wrap gap-2">{data.Forbidden.map((name) => <li key={name} data-forbidden={name}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-foreground">
          <Ban aria-hidden="true" className="h-4 w-4 text-destructive" /><span>{t("ed.d.dossier.forbiddenDevice", { device: name })}</span>
        </li>)}</ul>}
    </Section>
    <Section id="dossier-credentials" title={t("ed.d.dossier.credentials")}>
      {data.Credentials.length === 0
        ? <EmptyState compact message={t("ed.d.dossier.noCredentials")} />
        : <ul className="min-w-0 space-y-2">{data.Credentials.map((credential, index) => {
          const where = credential.Port ? t("ed.d.dossier.at", { device: credential.Device, port: credential.Port }) : credential.Device
          return <li key={index} data-dossier-credential={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-md border border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{where}</p>
              <p className="truncate text-xs text-muted-foreground">{credential.User ? t("ed.d.dossier.user", { user: credential.User }) : t("ed.d.dossier.noUser")}</p>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <MaskedText value={credential.Value} />
              {credential.Value !== "" && <CopyIconButton text={credential.Value} label={t("ed.d.dossier.copyValue", { device: credential.Device })} />}
            </div>
          </li>
        })}</ul>}
    </Section>
    <Section id="dossier-topology" title={t("ed.d.dossier.topology")}>
      {shown === null
        ? <p className="text-sm text-muted-foreground">{t("ed.d.dossier.topologyNone")}</p>
        : <>
          {data.Topology === "operates" && <p className="text-xs text-muted-foreground">{t("ed.d.dossier.topologyOperates")}</p>}
          <div data-dossier-schema={data.Topology === "operates" ? "operates" : "full"} className="relative min-h-[18rem] overflow-hidden rounded-md border border-border">
            <SchemaView topology={shown} status={status} selected={selected} onSelect={onSelect} />
          </div>
        </>}
    </Section>
  </div>
}
