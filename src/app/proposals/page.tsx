"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { approveProposal, listProposals, rejectProposal, type Proposal, type ProposalStatus } from "@/api/exercises/proposals"
import { GuideLink } from "@/components/exercises/GuideLink"
import { AccessLevelFields, accessValueValid, type AccessValue } from "@/components/exercises/AccessLevelFields"
import { useExerciseAccess } from "@/components/shell/AccessContext"
import { NoAccessScreen } from "@/components/shell/NoAccessScreen"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/ui/form-field"
import { Segmented } from "@/components/ui/segmented"
import { LoadingArea } from "@/components/ui/spinner"
import { Table, TableState, TABLE_CELL, TABLE_HEAD_CELL, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { toastApiError } from "@/components/ui/toastApiError"
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
  const [accessError, setAccessError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const nameValid = name.trim().length >= 3 && name.trim().length <= 50

  async function approve() {
    setNameError(null)
    setAccessError(null)
    setBusy(true)
    try {
      const approved = await approveProposal(proposal.ID, { Name: name, AccessLevel: access.level, EventIDs: access.eventIds, Note: note })
      onDone(approved)
    } catch (error) {
      // The name is taken in the catalog (a unique-name violation answers 40903).
      if (exerciseErrorCode(error) === ERR_EXERCISE_EXISTS) setNameError(t("exercises.err.nameExists"))
      else if (exerciseErrorCode(error) === 20908) setNameError(t("admin.ex.err.nameInvalid"))
      else if (exerciseErrorCode(error) === 20953) setAccessError(exerciseErrorMessage(error))
      else toastApiError(error, () => void approve())
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
          <Field label={t("exercises.proposals.name")} required error={nameError ?? (touched && !nameValid ? t("admin.ex.err.nameInvalid") : undefined)}>
            {(control) => <Input {...control} value={name} onChange={(event) => { setName(event.target.value); setNameError(null) }} onBlur={() => setTouched(true)} disabled={busy} />}
          </Field>
          <AccessLevelFields error={accessError} value={access} onChange={(value) => { setAccess(value); setAccessError(null) }} allowOwn originEventName={proposal.EventName} disabled={busy} />
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">{t("exercises.proposals.decisionNote")}</Label>
            <Textarea id="approve-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("admin.exPage.dialog.cancel")}</Button>
          <Button type="button" busy={busy} disabled={!nameValid || !accessValueValid(access)} onClick={() => void approve()}>{busy ? t("exercises.proposals.approving") : t("exercises.proposals.approve")}</Button>
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
      cancelLabel={t("admin.exPage.dialog.cancel")} confirmLabel={t("exercises.proposals.reject")} busyLabel={t("exercises.proposals.rejecting")} onConfirm={() => void reject()}>
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
  // The decisions need exercises.publish (POST proposals/:id/approve|reject): a read-only admin only reads the list.
  const canDecide = status === "pending" && (access?.CanPublish ?? false)
  const columns = canDecide ? 6 : 5

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
    return <NoAccessScreen mode="block" title={t("exercises.proposals.forbidden")} />
  }

  function decided(proposal: Proposal) {
    setItems((current) => current?.filter((item) => item.ID !== proposal.ID) ?? null)
  }

  return (
    <div className="frost-panel flex min-h-full min-w-0 flex-col rounded-lg sm:h-full sm:min-h-0 sm:overflow-hidden p-3 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-semibold text-foreground">{t("exercises.proposals.title")}</h1><GuideLink topic="zavdannia" /></div>
        <Segmented value={status} onChange={(value) => setStatus(value as ProposalStatus)} ariaLabel={t("exercises.proposals.status")}
          options={STATUSES.map((value) => ({ value, label: t(`exercises.proposals.status.${value}`) }))} />
      </div>
      {approved?.CatalogExerciseID && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--ib-ok-bg)] px-3.5 py-2.5 text-sm text-[var(--ib-ok)]">
          <span>{t("exercises.proposals.approved", { name: approved.ExerciseName })}</span>
          <Link href={exerciseHref(approved.CatalogExerciseID)} className="font-medium underline underline-offset-2">{t("exercises.proposals.openCatalog")}</Link>
        </div>
      )}
      <Table label={t("exercises.proposals.title")} busy={items === null} className="block md:table md:min-w-[44rem]">
        <thead className="sr-only md:not-sr-only md:table-header-group">
          <tr className={TABLE_HEAD_ROW}>
            <th scope="col" className={TABLE_HEAD_CELL}>{t("exercises.proposals.col.exercise")}</th>
            <th scope="col" className={TABLE_HEAD_CELL}>{t("exercises.proposals.col.event")}</th>
            <th scope="col" className={TABLE_HEAD_CELL}>{t("exercises.proposals.col.by")}</th>
            <th scope="col" className={TABLE_HEAD_CELL}>{t("exercises.proposals.col.note")}</th>
            <th scope="col" className={TABLE_HEAD_CELL}>{t(status === "pending" ? "exercises.proposals.col.at" : "exercises.proposals.col.decided")}</th>
            {canDecide && <th scope="col" className={TABLE_HEAD_CELL}><span className="sr-only">{t("exercises.proposals.col.actions")}</span></th>}
          </tr>
        </thead>
        {items === null ? <TableState colSpan={columns}><LoadingArea label={t("admin.loading")} /></TableState>
          : error ? <TableState colSpan={columns}><LoadError message={t("exercises.proposals.loadError")} error={error.cause} onRetry={() => setReload((key) => key + 1)} /></TableState>
          : items.length === 0 ? <TableState colSpan={columns}><EmptyState message={t(`exercises.proposals.empty.${status}`)} /></TableState>
          : (
            <tbody className="block md:table-row-group">
              {items.map((item) => (
                <tr key={item.ID} className={`${TABLE_ROW} mb-3 block h-auto rounded-md border border-border p-3 align-top last:mb-0 md:mb-0 md:table-row md:rounded-none md:border-0 md:p-0`}>
                  <td className={`${TABLE_CELL} block border-0 px-0 py-1 md:table-cell md:border-b md:px-3 md:py-2`}>
                    <Link href={exerciseHref(item.ExerciseID)} className="break-words font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary">{item.ExerciseName}</Link>
                    {item.CatalogExerciseID && <Link href={exerciseHref(item.CatalogExerciseID)} className="block text-xs text-primary hover:underline">{t("exercises.proposals.openCatalog")}</Link>}
                  </td>
                  <td className={`${TABLE_CELL} block break-words border-0 px-0 py-1 text-muted-foreground md:table-cell md:border-b md:px-3 md:py-2`}><span aria-hidden="true" className="mr-2 text-xs md:hidden">{t("exercises.proposals.col.event")}</span>{item.EventName}</td>
                  <td className={`${TABLE_CELL} block break-words border-0 px-0 py-1 text-muted-foreground md:table-cell md:border-b md:px-3 md:py-2`}><span aria-hidden="true" className="mr-2 text-xs md:hidden">{t("exercises.proposals.col.by")}</span>{item.ProposedByName || <span aria-label={t("admin.ex.none")}>—</span>}</td>
                  <td className={`${TABLE_CELL} block border-0 px-0 py-1 text-muted-foreground md:table-cell md:max-w-sm md:border-b md:px-3 md:py-2`}>
                    {item.Note ? <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.Note}</span> : <span aria-label={t("admin.ex.none")}>—</span>}
                    {item.DecisionNote && <span className="mt-1 block whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">{t("exercises.proposals.decisionNoteLine", { note: item.DecisionNote })}</span>}
                  </td>
                  <td className={`${TABLE_CELL} block border-0 px-0 py-1 tabular-nums text-muted-foreground md:table-cell md:whitespace-nowrap md:border-b md:px-3 md:py-2`}>
                    {(() => { const at = (status === "pending" ? item.ProposedAt : item.DecidedAt) ?? item.ProposedAt; return <time dateTime={at}>{formatExerciseDateTime(at)}</time> })()}
                  </td>
                  {canDecide && (
                    <td className={`${TABLE_CELL} block border-0 px-0 pt-3 text-right md:table-cell md:whitespace-nowrap md:border-b md:px-3 md:py-2`}>
                      <span className="inline-flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(item)}>{t("exercises.proposals.reject")}</Button>
                        <Button type="button" size="sm" onClick={() => setApproving(item)}>{t("exercises.proposals.approve")}</Button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )}
      </Table>
      {approving && <ApproveDialog proposal={approving} onClose={() => setApproving(null)}
        onDone={(proposal) => { setApproving(null); setApproved(proposal); decided(proposal); toast.success(t("exercises.proposals.approvedToast")) }} />}
      {rejecting && <RejectDialog proposal={rejecting} onClose={() => setRejecting(null)}
        onDone={(proposal) => { setRejecting(null); decided(proposal); toast.success(t("exercises.proposals.rejectedToast")) }} />}
    </div>
  )
}
