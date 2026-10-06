"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { approveProposal, listProposals, rejectProposal, type Proposal, type ProposalStatus } from "@/api/exercises/proposals"
import { AccessLevelFields, accessValueValid, type AccessValue } from "@/components/exercises/AccessLevelFields"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingArea } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { ERR_EXERCISE_EXISTS, exerciseErrorCode, exerciseErrorMessage } from "@/lib/exerciseErrors"
import { exerciseHref } from "@/lib/exerciseRoutes"
import { formatExerciseDateTime } from "@/lib/exerciseStatus"

const STATUSES: ProposalStatus[] = ["pending", "approved", "rejected"]

function ApproveDialog({ proposal, onClose, onDone }: { proposal: Proposal; onClose: () => void; onDone: (proposal: Proposal) => void }) {
  const [name, setName] = useState(proposal.ExerciseName)
  const [access, setAccess] = useState<AccessValue>({ level: "own", eventIds: [] })
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const nameValid = name.trim().length >= 3

  async function approve() {
    setBusy(true)
    try {
      const approved = await approveProposal(proposal.ID, { Name: name, AccessLevel: access.level, EventIDs: access.eventIds, Note: note })
      onDone(approved)
    } catch (error) {
      // The name is taken in the catalog (a unique-name violation answers 40903).
      toast.error(exerciseErrorCode(error) === ERR_EXERCISE_EXISTS ? t("exercises.err.nameExists") : exerciseErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("exercises.proposals.approveTitle")}</DialogTitle>
          <DialogDescription>{t("exercises.proposals.approveDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="approve-name">{t("exercises.proposals.name")}</Label>
            <Input id="approve-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!nameValid} disabled={busy} />
          </div>
          <AccessLevelFields value={access} onChange={setAccess} allowOwn originEventName={proposal.EventName} disabled={busy} />
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">{t("exercises.proposals.decisionNote")}</Label>
            <Textarea id="approve-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="button" disabled={busy || !nameValid || !accessValueValid(access)} onClick={() => void approve()}>{t("exercises.proposals.approve")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ proposal, onClose, onDone }: { proposal: Proposal; onClose: () => void; onDone: (proposal: Proposal) => void }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function reject() {
    setBusy(true)
    setError("")
    try {
      onDone(await rejectProposal(proposal.ID, note))
    } catch (cause) {
      setError(exerciseErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog open onCancel={onClose} tone="danger" busy={busy} error={error}
      title={t("exercises.proposals.rejectTitle")} description={`${proposal.ExerciseName} · ${proposal.EventName}`}
      cancelLabel={t("admin.exPage.dialog.cancel")} confirmLabel={t("exercises.proposals.reject")} onConfirm={() => void reject()}>
      <div className="space-y-1.5">
        <Label htmlFor="reject-note">{t("exercises.proposals.rejectNote")}</Label>
        <Textarea id="reject-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
      </div>
    </ConfirmDialog>
  )
}

export default function ProposalsPage() {
  const { access } = useExerciseAccess()
  const [status, setStatus] = useState<ProposalStatus>("pending")
  const [items, setItems] = useState<Proposal[] | null>(null)
  const [error, setError] = useState<{ cause: unknown } | null>(null)
  const [reload, setReload] = useState(0)
  const [approving, setApproving] = useState<Proposal | null>(null)
  const [rejecting, setRejecting] = useState<Proposal | null>(null)
  const [approved, setApproved] = useState<Proposal | null>(null)
  const isAdmin = access?.IsAdmin ?? false

  useEffect(() => {
    if (!isAdmin) return
    let active = true
    queueMicrotask(() => { if (active) { setItems(null); setError(null) } })
    listProposals(status)
      .then((next) => { if (active) setItems(next) })
      .catch((cause) => { if (active) { setItems([]); setError({ cause }) } })
    return () => { active = false }
  }, [isAdmin, status, reload])

  if (!isAdmin) {
    return <p role="alert" className="text-sm text-muted-foreground">{t("exercises.proposals.forbidden")}</p>
  }

  function decided(proposal: Proposal) {
    setItems((current) => current?.filter((item) => item.ID !== proposal.ID) ?? null)
  }

  return (
    <div className="frost-panel frost-in flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{t("exercises.proposals.title")}</h1>
        <div role="radiogroup" aria-label={t("exercises.proposals.status")} className="inline-flex h-10 items-center rounded-md bg-muted p-1">
          {STATUSES.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={status === value} onClick={() => setStatus(value)}
              className={`h-8 rounded px-3 text-sm ${status === value ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t(`exercises.proposals.status.${value}`)}
            </button>
          ))}
        </div>
      </div>
      {approved?.CatalogExerciseID && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--ib-ok-bg)] px-3.5 py-2.5 text-sm text-[var(--ib-ok)]">
          <span>{t("exercises.proposals.approved").replace("{name}", approved.ExerciseName)}</span>
          <Link href={exerciseHref(approved.CatalogExerciseID)} className="font-medium underline underline-offset-2">{t("exercises.proposals.openCatalog")}</Link>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {items === null ? <LoadingArea className="h-full" label={t("admin.loading")} />
          : error ? <LoadError message={t("exercises.proposals.loadError")} error={error.cause} onRetry={() => setReload((key) => key + 1)} className="h-full" />
          : items.length === 0 ? <EmptyState message={t(`exercises.proposals.empty.${status}`)} className="h-full" />
          : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t("exercises.proposals.col.exercise")}</th>
                  <th className="px-3 py-2 font-medium">{t("exercises.proposals.col.event")}</th>
                  <th className="px-3 py-2 font-medium">{t("exercises.proposals.col.by")}</th>
                  <th className="px-3 py-2 font-medium">{t("exercises.proposals.col.note")}</th>
                  <th className="px-3 py-2 font-medium">{t(status === "pending" ? "exercises.proposals.col.at" : "exercises.proposals.col.decided")}</th>
                  {status === "pending" && <th className="px-3 py-2"><span className="sr-only">{t("exercises.proposals.col.actions")}</span></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.ID} className="h-10 border-b border-border/50 align-top">
                    <td className="px-3 py-2">
                      <Link href={exerciseHref(item.ExerciseID)} className="font-medium text-foreground hover:underline">{item.ExerciseName}</Link>
                      {item.CatalogExerciseID && <Link href={exerciseHref(item.CatalogExerciseID)} className="block text-xs text-primary hover:underline">{t("exercises.proposals.openCatalog")}</Link>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.EventName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.ProposedByName || "—"}</td>
                    <td className="max-w-sm px-3 py-2 text-muted-foreground">
                      <span className="line-clamp-3 whitespace-pre-line">{item.Note || "—"}</span>
                      {item.DecisionNote && <span className="mt-1 block text-xs">{t("exercises.proposals.decisionNote")}: {item.DecisionNote}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatExerciseDateTime((status === "pending" ? item.ProposedAt : item.DecidedAt) ?? item.ProposedAt)}</td>
                    {status === "pending" && (
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="inline-flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(item)}>{t("exercises.proposals.reject")}</Button>
                          <Button type="button" size="sm" onClick={() => setApproving(item)}>{t("exercises.proposals.approve")}</Button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {approving && <ApproveDialog proposal={approving} onClose={() => setApproving(null)}
        onDone={(proposal) => { setApproving(null); setApproved(proposal); decided(proposal); toast.success(t("exercises.proposals.approvedToast")) }} />}
      {rejecting && <RejectDialog proposal={rejecting} onClose={() => setRejecting(null)}
        onDone={(proposal) => { setRejecting(null); decided(proposal); toast.success(t("exercises.proposals.rejectedToast")) }} />}
    </div>
  )
}
