"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Archive, ArchiveRestore, Camera, Check, ChevronDown, CircleAlert, Download, Ellipsis, History, Pencil, Play,
  RotateCcw, Send, ShieldCheck, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { t } from "@/i18n/t"
import { Spinner } from "@/components/ui/spinner"
import type { AutosaveStatus } from "@/lib/autosaveQueue"
import type { ReactNode } from "react"
import type { ExerciseBadgeKind } from "@/lib/exerciseStatus"
import { cn } from "@/utils/cn"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

export type HeaderMode = "new" | "view" | "edit" | "version" | "readonly"
export type HeaderPermissions = { write: boolean; publish: boolean; delete: boolean; export: boolean }
export type HeaderBadge = { kind: ExerciseBadgeKind; label?: string } | { kind: "version"; label: string }
export type TestVariantOption = { index: number; label: string; disabled: boolean }

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
  revertable: boolean
  busy: boolean
  testAvailable: boolean
  /** The test action is shown but disabled; the reason (when known) appears in a tooltip. */
  testBlocked?: boolean
  testBlockedReason?: string
  getTestVariants: () => TestVariantOption[]
  usageEvents: string[]
  onRetrySave: () => void
  onCancelNew: () => void
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
}

const BADGE_CLASS: Record<HeaderBadge["kind"], string> = {
  none: "bg-muted text-muted-foreground",
  published: "bg-[var(--ib-ok-bg)] text-[var(--ib-ok)]",
  changes: "bg-[var(--ib-warn-bg)] text-[var(--ib-warn)]",
  archived: "bg-muted text-muted-foreground",
  version: "bg-primary/10 text-primary",
}

const ICON = "h-4 w-4"

function StatusBadge({ badge }: { badge: HeaderBadge }) {
  const label = badge.label ?? t(`admin.exPage.badge.${badge.kind}`)
  return (
    <span
      data-badge={badge.kind}
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
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
        {variants.map((variant) => (
          <DropdownMenuItem key={variant.index} disabled={variant.disabled} onSelect={() => onTest(variant.index)}>
            {variant.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MoreMenu(props: ExerciseHeaderProps) {
  const { permissions, archived, revertable, usageEvents, busy } = props
  const snapshot = permissions.write && !archived
  // Restores the working copy only (never touches events) — exercises.write.
  const revert = permissions.write && revertable && !archived
  const exportItem = permissions.export
  const archiveItem = permissions.write
  const deleteItem = permissions.delete
  const top = snapshot || revert || exportItem
  const bottom = archiveItem || deleteItem
  if (!top && !bottom) return null
  const inUse = usageEvents.length > 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={t("admin.exPage.action.more")} disabled={busy}>
          <Ellipsis aria-hidden="true" className={ICON} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {snapshot && (
          <DropdownMenuItem className="gap-2" onSelect={props.onSnapshot}>
            <Camera aria-hidden="true" className={ICON} />
            {t("admin.exPage.action.snapshot")}
          </DropdownMenuItem>
        )}
        {revert && (
          <>
            <DropdownMenuItem className="gap-2" onSelect={props.onRevert}>
              <RotateCcw aria-hidden="true" className={ICON} />
              {t("admin.exPage.action.revert")}
            </DropdownMenuItem>
            <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">{t("admin.exPage.action.revertHint")}</p>
          </>
        )}
        {exportItem && (
          <DropdownMenuItem className="gap-2" onSelect={props.onExport}>
            <Download aria-hidden="true" className={ICON} />
            {t("admin.exPage.action.export")}
          </DropdownMenuItem>
        )}
        {top && bottom && <DropdownMenuSeparator />}
        {archiveItem &&
          (archived ? (
            <DropdownMenuItem className="gap-2" onSelect={props.onUnarchive}>
              <ArchiveRestore aria-hidden="true" className={ICON} />
              {t("admin.exPage.action.unarchive")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="gap-2" onSelect={props.onArchive}>
              <Archive aria-hidden="true" className={ICON} />
              {t("admin.exPage.action.archive")}
            </DropdownMenuItem>
          ))}
        {deleteItem && (
          <>
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" disabled={inUse} onSelect={props.onDelete}>
              <Trash2 aria-hidden="true" className={ICON} />
              {t("admin.exPage.action.delete")}
            </DropdownMenuItem>
            {inUse && (
              <p className="px-2 pb-1.5 pl-8 text-xs text-muted-foreground">
                {t("admin.exPage.action.deleteInUse").replace("{events}", usageEvents.map((name) => `«${name}»`).join(", "))}
              </p>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A disabled button cannot take focus, so the pending hint is also its description for screen readers.
function ProposeButton({ pending, disabled, onClick }: { pending?: boolean; disabled: boolean; onClick: () => void }) {
  const button = <Button type="button" variant="outline" disabled={disabled} onClick={onClick}>
    <Send aria-hidden="true" className={cn(ICON, "mr-1.5")} />
    {t("exercises.propose.button")}
  </Button>
  return pending ? <HoverTooltip text={t("exercises.badge.pending")} describe>{button}</HoverTooltip> : button
}

export function ExerciseHeader(props: ExerciseHeaderProps) {
  const { mode, title, badge, saveStatus, permissions, archived, publishable, busy, testAvailable } = props
  const created = mode !== "new"
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {badge && <StatusBadge badge={badge} />}
        {props.meta}
        {(mode === "edit" || mode === "new") && <SaveIndicator status={saveStatus} onRetry={props.onRetrySave} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "readonly" ? null : mode === "version" ? (
          <Button type="button" variant="outline" onClick={props.onHistory}>
            <History aria-hidden="true" className={cn(ICON, "mr-1.5")} />
            {t("admin.exPage.action.history")}
          </Button>
        ) : (
          <>
            {testAvailable && props.activeTestUntil && props.onOpenTest && (
              <span className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm">
                <span className="text-foreground">
                  {t("admin.exPage.test.running", { time: new Date(props.activeTestUntil).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) })}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={props.onOpenTest}>{t("admin.exPage.test.open")}</Button>
              </span>
            )}
            {testAvailable && <TestMenu disabled={!created || busy || Boolean(props.testBlocked)} blockedReason={props.testBlockedReason} getVariants={props.getTestVariants} onTest={props.onTest} />}
            <Button type="button" variant="outline" disabled={!created} onClick={props.onHistory}>
              <History aria-hidden="true" className={cn(ICON, "mr-1.5")} />
              {t("admin.exPage.action.history")}
            </Button>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
            {mode === "new" && (
              <Button asChild variant="outline">
                <Link href="/" onClick={props.onCancelNew}>
                  {t("admin.ex.create.cancel")}
                </Link>
              </Button>
            )}
            {mode === "view" && permissions.write && !archived && (
              <Button type="button" variant="outline" disabled={busy} onClick={props.onEdit}>
                <Pencil aria-hidden="true" className={cn(ICON, "mr-1.5")} />
                {t("admin.exPage.action.edit")}
              </Button>
            )}
            {mode === "edit" && (
              <Button type="button" variant="outline" disabled={busy} onClick={props.onDone}>
                {t("admin.exPage.action.done")}
              </Button>
            )}
            {created && props.onAccess && (
              <Button type="button" variant="outline" disabled={busy} onClick={props.onAccess}>
                <ShieldCheck aria-hidden="true" className={cn(ICON, "mr-1.5")} />
                {t("exercises.access.button")}
              </Button>
            )}
            {created && props.onPropose && (
              <ProposeButton pending={props.proposalPending} disabled={busy || !!props.proposalPending} onClick={props.onPropose} />
            )}
            {permissions.publish && (
              <Button type="button" disabled={!created || !publishable || busy} onClick={props.onPublish}>
                {t("admin.exPage.action.publish")}
              </Button>
            )}
            {created && <MoreMenu {...props} />}
          </>
        )}
      </div>
    </div>
  )
}
