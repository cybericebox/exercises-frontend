"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Archive, ArchiveRestore, ArrowLeft, BookOpen, Camera, Check, ChevronDown, CircleAlert, Download, Ellipsis, History, Pencil, Play,
  RotateCcw, Send, ShieldCheck, Trash2, Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { t } from "@/i18n/t"
import { Spinner } from "@/components/ui/spinner"
import type { AutosaveStatus } from "@/lib/autosaveQueue"
import type { ReactNode } from "react"
import type { ExerciseBadgeKind } from "@/lib/exerciseStatus"
import { cn } from "@/utils/cn"
import { guideHref } from "@/content/guide/registry"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

export type HeaderMode = "new" | "view" | "edit" | "version" | "readonly"
export type HeaderPermissions = { write: boolean; publish: boolean; delete: boolean; export: boolean }
export type HeaderBadge = { kind: ExerciseBadgeKind; label?: string } | { kind: "version"; label: string }
export type TestVariantOption = { index: number; label: string; disabled: boolean; reason?: string }

export type ExerciseHeaderProps = {
  mode: HeaderMode
  title: string
  badge: HeaderBadge | null
  /** Shown on the title line after the status (infrastructure, access, fork/proposal). */
  meta?: ReactNode
  saveStatus: AutosaveStatus
  permissions: HeaderPermissions
  archived: boolean
  publishable: boolean
  /** Publishing is shown but disabled; the reason (resources without an approval) appears in a tooltip. */
  publishBlockedReason?: string
  revertable: boolean
  busy: boolean
  /** The action that keeps the header busy: its button names it («Публікуємо…»). */
  running?: string | null
  testAvailable: boolean
  /** The test action is shown but disabled; the reason (when known) appears in a tooltip. */
  testBlocked?: boolean
  testBlockedReason?: string
  getTestVariants: () => TestVariantOption[]
  usageEvents: string[]
  onRetrySave: () => void
  onCancelNew: (event: React.MouseEvent) => void
  onTest: (variantIndex: number) => void
  /** The caller already has a test lab running for this exercise: its lease end (ISO). */
  activeTestUntil?: string | null
  onOpenTest?: () => void
  onHistory: () => void
  onEdit: () => void
  onDone: () => void
  onPublish: () => void
  onSnapshot: () => void
  onRevert: () => void
  onExport: () => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
  /** Admins, catalog exercises: open the access level dialog. */
  onAccess?: () => void
  /** Managers, published event exercises: propose to the catalog. */
  onPropose?: () => void
  /** A proposal is already under review: the propose action is shown disabled. */
  proposalPending?: boolean
  /** Render only when a working, separately approved reimport destination exists. */
  onImportUpdate?: () => void
}

const BADGE_CLASS: Record<HeaderBadge["kind"], string> = {
  none: "text-muted-foreground",
  published: "text-[var(--ib-ok)]",
  changes: "text-[var(--ib-warn)]",
  archived: "text-muted-foreground",
  version: "text-primary",
}

const ICON = "h-4 w-4"

function StatusBadge({ badge }: { badge: HeaderBadge }) {
  const label = badge.label ?? t(`admin.exPage.badge.${badge.kind}`)
  return (
    <span
      data-badge={badge.kind}
      className={cn(
        "general-status inline-flex items-center gap-1.5 text-xs",
        BADGE_CLASS[badge.kind]
      )}
    >
      {label}
    </span>
  )
}

function SaveIndicator({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  if (status === "idle") return null
  if (status === "error") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        {t("admin.exPage.save.error")}
        <span aria-hidden="true">·</span>
        <button type="button" className="underline underline-offset-2" onClick={onRetry}>
          {t("admin.exPage.save.retry")}
        </button>
      </span>
    )
  }
  const saved = status === "saved"
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {saved ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <span aria-hidden="true" className="inline-flex"><Spinner size="sm" /></span>
      )}
      {t(saved ? "admin.exPage.save.saved" : "admin.exPage.save.saving")}
    </span>
  )
}

function TestMenu({
  disabled,
  blockedReason,
  getVariants,
  onTest,
}: {
  disabled: boolean
  blockedReason?: string
  getVariants: () => TestVariantOption[]
  onTest: (index: number) => void
}) {
  const [variants, setVariants] = useState<TestVariantOption[]>([])
  const trigger = (
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" disabled={disabled}>
        <Play aria-hidden="true" className={cn(ICON, "mr-1.5")} />
        {t("admin.exPage.action.test")}
        <ChevronDown aria-hidden="true" className={cn(ICON, "ml-1")} />
      </Button>
    </DropdownMenuTrigger>
  )
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setVariants(getVariants())
      }}
    >
      {blockedReason ? <HoverTooltip text={blockedReason} describe>{trigger}</HoverTooltip> : trigger}
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("admin.exPage.action.testMenu")}
        </DropdownMenuLabel>
        {variants.map((variant) => {
          const item = (
            <DropdownMenuItem disabled={variant.disabled} onSelect={() => onTest(variant.index)}>
              {variant.label}
            </DropdownMenuItem>
          )
          return variant.disabled && variant.reason
            ? <HoverTooltip key={variant.index} text={variant.reason} describe>{item}</HoverTooltip>
            : <span key={variant.index} className="contents">{item}</span>
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MoreMenu(props: ExerciseHeaderProps) {
  const { permissions, archived, revertable, usageEvents, busy } = props
  const [variants, setVariants] = useState<TestVariantOption[]>([])
  const snapshot = permissions.write && !archived
  const revert = permissions.write && revertable && !archived
  const access = Boolean(props.onAccess || props.onPropose)
  const transfer = permissions.export || (permissions.write && !archived && props.onImportUpdate)
  const lifecycle = permissions.write || permissions.delete
  const inUse = usageEvents.length > 0
  return <DropdownMenu onOpenChange={(open) => { if (open) setVariants(props.getTestVariants()) }}>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size="icon" aria-label={t("admin.exPage.action.more")} disabled={busy} className="general-utility">
        <Ellipsis aria-hidden="true" className={ICON} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-72">
      {props.testAvailable && <>
        <DropdownMenuGroup aria-label={t("admin.exPage.action.test")} className="general-phone-test">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={busy || Boolean(props.testBlocked)} className="gap-2">
              <Play aria-hidden="true" className={ICON} />{t("admin.exPage.action.test")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56">
              {variants.map((variant) => <DropdownMenuItem key={variant.index} disabled={variant.disabled} onSelect={() => props.onTest(variant.index)}>
                <span>{variant.label}{variant.disabled && variant.reason && <span className="block text-xs text-muted-foreground">{variant.reason}</span>}</span>
              </DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {props.testBlockedReason && <p className="px-2 text-xs text-muted-foreground">{props.testBlockedReason}</p>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="general-phone-test" />
      </>}
      <DropdownMenuGroup aria-label={t("admin.exGeneral.versions")}>
        <DropdownMenuItem className="gap-2" onSelect={props.onHistory}><History aria-hidden="true" className={ICON} />{t("admin.exPage.action.history")}</DropdownMenuItem>
        {snapshot && <DropdownMenuItem className="gap-2" onSelect={props.onSnapshot}><Camera aria-hidden="true" className={ICON} />{t("admin.exPage.action.snapshot")}</DropdownMenuItem>}
      </DropdownMenuGroup>
      {access && <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label={t("admin.exGeneral.access")}>
          {props.onAccess && <DropdownMenuItem className="gap-2" onSelect={props.onAccess}><ShieldCheck aria-hidden="true" className={ICON} />{t("exercises.access.button")}</DropdownMenuItem>}
          {props.onPropose && <>
            <DropdownMenuItem className="gap-2" disabled={busy || props.proposalPending} onSelect={props.onPropose}><Send aria-hidden="true" className={ICON} />{t("exercises.propose.button")}</DropdownMenuItem>
            {props.proposalPending && <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">{t("exercises.badge.pending")}</p>}
          </>}
        </DropdownMenuGroup>
      </>}
      {transfer && <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label={t("admin.exGeneral.transfer")}>
          {permissions.write && !archived && props.onImportUpdate && <DropdownMenuItem className="gap-2" onSelect={props.onImportUpdate}><Upload aria-hidden="true" className={ICON} />{t("admin.exGeneral.importUpdate")}</DropdownMenuItem>}
          {permissions.export && <DropdownMenuItem className="gap-2" onSelect={props.onExport}><Download aria-hidden="true" className={ICON} />{t("admin.exPage.action.export")}</DropdownMenuItem>}
        </DropdownMenuGroup>
      </>}
      {lifecycle && <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label={t("admin.exGeneral.lifecycle")}>
          {permissions.write && (archived
            ? <DropdownMenuItem className="gap-2" onSelect={props.onUnarchive}><ArchiveRestore aria-hidden="true" className={ICON} />{t("admin.exPage.action.unarchive")}</DropdownMenuItem>
            : <DropdownMenuItem className="gap-2" onSelect={props.onArchive}><Archive aria-hidden="true" className={ICON} />{t("admin.exPage.action.archive")}</DropdownMenuItem>)}
          {revert && <>
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={props.onRevert}><RotateCcw aria-hidden="true" className={ICON} />{t("admin.exPage.action.revert")}</DropdownMenuItem>
            <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">{t("admin.exPage.action.revertHint")}</p>
          </>}
          {permissions.delete && <>
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" disabled={inUse} onSelect={props.onDelete}><Trash2 aria-hidden="true" className={ICON} />{t("admin.exPage.action.delete")}</DropdownMenuItem>
            {inUse && <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">{t("admin.exPage.action.deleteInUse", { events: usageEvents.map((name) => t("admin.exPage.action.eventName", { name })).join(", ") })}</p>}
          </>}
        </DropdownMenuGroup>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>
}

export function ExerciseHeader(props: ExerciseHeaderProps) {
  const { mode, title, badge, saveStatus, permissions, archived, publishable, busy, testAvailable } = props
  const created = mode !== "new"
  return <header className="general-shared-header">
    <HoverTooltip text={t("admin.exDetail.back")} describe><Link href="/" aria-label={t("admin.exDetail.back")} className="general-back"><ArrowLeft aria-hidden="true" className="h-4 w-4" /></Link></HoverTooltip>
    <div className="general-identity">
      <h1 className="break-words text-xl font-semibold leading-[1.3] tracking-tight text-foreground md:text-2xl">{title}</h1>
      <div className="general-context">
        {badge && <StatusBadge badge={badge} />}
        {props.meta}
        {(mode === "edit" || mode === "new") && <SaveIndicator status={saveStatus} onRetry={props.onRetrySave} />}
      </div>
    </div>
    <div className="general-utilities">
      <HoverTooltip text={t("admin.exGuide.zavdannia")} describe><Button asChild variant="outline" size="icon" className="general-utility"><Link href={guideHref("zavdannia")} aria-label={t("admin.exGuide.zavdannia")}><BookOpen aria-hidden="true" className={ICON} /></Link></Button></HoverTooltip>
      {mode === "version" && <HoverTooltip text={t("admin.exPage.action.history")} describe>
        <Button type="button" variant="outline" size="icon" className="general-utility" aria-label={t("admin.exPage.action.history")} onClick={props.onHistory}><History aria-hidden="true" className={ICON} /></Button>
      </HoverTooltip>}
      {created && mode !== "readonly" && mode !== "version" && <MoreMenu {...props} />}
    </div>
    {mode !== "readonly" && mode !== "version" && <div className="general-primary-actions">
      {created && testAvailable && <span className="general-direct-test"><TestMenu disabled={busy || Boolean(props.testBlocked)} blockedReason={props.testBlockedReason} getVariants={props.getTestVariants} onTest={props.onTest} /></span>}
      {mode === "new" && <Button asChild variant="outline"><Link href="/" data-allow-leave onClick={props.onCancelNew}>{t("admin.ex.create.cancel")}</Link></Button>}
      {mode === "view" && permissions.write && !archived && <Button type="button" variant="outline" disabled={busy} onClick={props.onEdit}><Pencil aria-hidden="true" className={cn(ICON, "mr-1.5")} />{t("admin.exPage.action.edit")}</Button>}
      {mode === "edit" && <Button type="button" variant="outline" disabled={busy} onClick={props.onDone}><Check aria-hidden="true" className={cn(ICON, "mr-1.5")} />{t("admin.exPage.action.done")}</Button>}
      {permissions.publish && (mode === "new" || publishable || props.running === "publish") && (() => {
        const publishing = props.running === "publish"
        const button = <Button type="button" className="general-publish" busy={publishing} busyLabel={t("admin.exPage.action.publishing")} disabled={!created || !publishable || busy || Boolean(props.publishBlockedReason)} onClick={props.onPublish}>{t("admin.exPage.action.publish")}</Button>
        return props.publishBlockedReason ? <HoverTooltip text={props.publishBlockedReason} describe>{button}</HoverTooltip> : button
      })()}
    </div>}
    {created && testAvailable && props.activeTestUntil && props.onOpenTest && <div className="general-running-test">
      <span>{t("admin.exPage.test.running", { time: new Date(props.activeTestUntil).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) })}</span>
      <Button type="button" variant="outline" size="sm" onClick={props.onOpenTest}>{t("admin.exPage.test.open")}</Button>
    </div>}
  </header>
}
