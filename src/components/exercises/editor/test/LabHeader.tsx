"use client"

import Link from "next/link"
import { ArrowLeft, CircleAlert, CircleCheck, Clock, Eye, EyeOff, LogOut, MoreHorizontal, Network, Shield, ShieldCheck, ShieldEllipsis, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverTooltip } from "@/components/ui/hover-tooltip"
import { Spinner } from "@/components/ui/spinner"
import { t } from "@/i18n/t"
import { formatCountdown, type LabChip, type VpnView } from "@/lib/testLab"
import { cn } from "@/utils/cn"

function chipText(chip: LabChip): { full: string; short: string } {
  switch (chip.kind) {
    case "creating": case "queued": return { full: t("ed.d.chip.creating"), short: t("ed.d.chip.creatingShort") }
    case "starting": return { full: t("ed.d.chip.starting", { ready: chip.ready, total: chip.total }), short: t("ed.d.chip.startingShort", { ready: chip.ready, total: chip.total }) }
    case "ready": return { full: t("ed.d.chip.ready"), short: t("ed.d.chip.readyShort") }
    case "deviceFailed": return { full: t("ed.d.chip.deviceFailed", { devices: chip.failed.join(", ") }), short: t("ed.d.chip.deviceFailedShort", { n: chip.failed.length }) }
    case "failed": return { full: t("ed.d.chip.failed"), short: t("ed.d.chip.failedShort") }
    case "expired": return { full: t("ed.d.chip.expired"), short: t("ed.d.chip.expiredShort") }
    default: return { full: t("ed.d.chip.removing"), short: t("ed.d.chip.removingShort") }
  }
}

/** The one status of the lab: icon, words, and the time left when the lab is up. On a phone only the icon and a short value. */
export function LabStatusChip({ chip, left }: { chip: LabChip; left: number | null }) {
  const { full, short } = chipText(chip)
  const tone = chip.kind === "ready" ? "ok" : chip.kind === "deviceFailed" || chip.kind === "expired" ? "warn" : chip.kind === "failed" ? "danger" : "busy"
  const icon = chip.kind === "ready" ? <CircleCheck aria-hidden="true" size={16} /> : chip.kind === "deviceFailed" ? <TriangleAlert aria-hidden="true" size={16} />
    : chip.kind === "failed" ? <CircleAlert aria-hidden="true" size={16} /> : chip.kind === "expired" ? <Clock aria-hidden="true" size={16} /> : <Spinner size="sm" label={t("admin.loading")} />
  const showTime = left !== null && (chip.kind === "ready" || chip.kind === "deviceFailed" || chip.kind === "starting")
  return <span role="status" aria-label={full} data-lab-chip={chip.kind}
    className={cn("inline-flex h-9 min-w-0 shrink items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm font-medium sm:px-3",
      tone === "ok" && "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]", tone === "warn" && "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]",
      tone === "danger" && "bg-destructive/10 text-destructive", tone === "busy" && "bg-secondary/60 text-foreground")}>
    <span className="flex shrink-0 items-center">{icon}</span>
    <span className="hidden truncate sm:inline">{full}</span>
    {/* On a phone the title needs the room: only the counters (starting, failed devices) keep a word beside the icon. */}
    <span className={cn("sm:hidden", chip.kind !== "starting" && chip.kind !== "deviceFailed" && "hidden")}>{short}</span>
    {showTime && <span className="hidden tabular-nums lg:inline" aria-hidden="true">· {formatCountdown(left)}</span>}
  </span>
}

/** The VPN control: an icon button (no caption) with the state in the icon, as on the event site's header. */
export function VpnButton({ vpn, checkFailed, onClick }: { vpn: VpnView; checkFailed?: boolean; onClick: () => void }) {
  const label = t(checkFailed ? "ed.d.vpn.header.checkFailed" : vpn.ready && vpn.connected === null ? "ed.d.vpn.header.unknown" : `ed.d.vpn.header.${vpn.state}`)
  const icon = vpn.state === "connected" ? <ShieldCheck aria-hidden="true" size={20} className="text-[var(--ib-ok)]" /> : vpn.state === "available" ? <Shield aria-hidden="true" size={20} /> : <ShieldEllipsis aria-hidden="true" size={20} />
  return <HoverTooltip text={label}>
    <Button type="button" variant="outline" size="icon" aria-label={label} aria-haspopup="dialog" data-vpn={vpn.state} onClick={onClick}>{icon}</Button>
  </HoverTooltip>
}

export type LabHeaderProps = {
  title: string
  subtitle: string
  backHref: string
  progress: { done: number; total: number }
  /** null: no lab chip yet (a static test shows the static caption). */
  chip: LabChip | null
  isStatic: boolean
  /** ms left in the lease, null when not known. */
  left: number | null
  vpn: VpnView | null
  onVpn: () => void
  authorShown: boolean
  onToggleAuthor: () => void
  dockShown: boolean
  onToggleDock: () => void
  canExtend: boolean
  onExtend: () => void
  canEnd: boolean
  /** The end is under way: the button stays, switched off. */
  endBusy: boolean
  onEnd: () => void
  /** The lab panel exists (not after a failed start or when the time is over): VPN, author data and the panel button go with it. */
  panel: boolean
}

/** One line at every width: back, title, progress, lab status, VPN, author data, the panel, end, and the «…» menu. */
export function LabHeader(props: LabHeaderProps) {
  const { title, subtitle, backHref, progress, chip, isStatic, left, vpn, onVpn, authorShown, onToggleAuthor, dockShown, onToggleDock, canExtend, onExtend, canEnd, endBusy, onEnd, panel } = props
  const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 0
  return <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <HoverTooltip text={t("ed.d.header.back")}>
        <Button asChild variant="ghost" size="icon"><Link href={backHref} aria-label={t("ed.d.header.back")}><ArrowLeft aria-hidden="true" size={18} /></Link></Button>
      </HoverTooltip>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-5 text-foreground">{title}</h1>
        <p className="truncate text-xs leading-4 text-muted-foreground">{subtitle}</p>
      </div>
      <div role="progressbar" aria-label={t("ed.d.header.progress", { done: progress.done, total: progress.total })} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
        className="ml-3 hidden shrink-0 items-center gap-2 text-sm text-muted-foreground xl:flex">
        <span aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></span>
        <span aria-hidden="true">{t("ed.d.header.progress", { done: progress.done, total: progress.total })}</span>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {chip && !isStatic && <LabStatusChip chip={chip} left={left} />}
      {isStatic && <span className="hidden h-9 items-center rounded-md bg-secondary/60 px-3 text-sm font-medium sm:inline-flex">{t("ed.d.chip.static")}{left !== null && <span className="ml-2 tabular-nums">· {formatCountdown(left)}</span>}</span>}
      {vpn && !isStatic && panel && <VpnButton vpn={vpn} onClick={onVpn} />}
      {!isStatic && panel && <HoverTooltip text={t(authorShown ? "ed.d.header.authorHide" : "ed.d.header.authorShow")}>
        <Button type="button" variant="outline" size="icon" className="max-md:hidden" aria-pressed={authorShown} aria-label={t("ed.d.header.author")} onClick={onToggleAuthor}>
          {authorShown ? <Eye aria-hidden="true" size={18} /> : <EyeOff aria-hidden="true" size={18} />}
        </Button>
      </HoverTooltip>}
      {!isStatic && panel && <HoverTooltip text={t(dockShown ? "ed.d.header.dockHide" : "ed.d.header.dockShow")}>
        <Button type="button" variant="outline" size="icon" aria-pressed={dockShown} aria-controls="lab-dock" aria-label={t("ed.d.header.dock")} onClick={onToggleDock}><Network aria-hidden="true" size={18} /></Button>
      </HoverTooltip>}
      {canEnd && <Button type="button" variant="outline" className="max-sm:hidden" disabled={endBusy} onClick={onEnd}>{t("ed.d.header.end")}</Button>}
      {(canExtend || canEnd) && <DropdownMenu>
        <HoverTooltip text={t("ed.d.header.more")}>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" aria-label={t("ed.d.header.more")}><MoreHorizontal aria-hidden="true" size={18} /></Button></DropdownMenuTrigger>
        </HoverTooltip>
        <DropdownMenuContent align="end" className="w-80">
          {canExtend && <DropdownMenuItem onSelect={onExtend} className="items-start">
            <Clock aria-hidden="true" size={16} className="mr-2 mt-0.5 shrink-0" />
            <span className="flex min-w-0 flex-col"><span>{t("ed.d.header.extend")}</span><span className="whitespace-normal text-xs text-muted-foreground">{t("ed.d.header.extendHint")}</span></span>
          </DropdownMenuItem>}
          {!isStatic && <DropdownMenuItem className="md:hidden" onSelect={onToggleAuthor}>
            {authorShown ? <EyeOff aria-hidden="true" size={16} className="mr-2" /> : <Eye aria-hidden="true" size={16} className="mr-2" />}{t(authorShown ? "ed.d.header.authorHide" : "ed.d.header.authorShow")}
          </DropdownMenuItem>}
          {canEnd && <>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem className="text-destructive focus:text-destructive sm:hidden" onSelect={onEnd}><LogOut aria-hidden="true" size={16} className="mr-2" />{t("ed.d.header.end")}</DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  </header>
}
