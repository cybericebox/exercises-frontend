"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { getExerciseCapabilities } from "@/api/exercises/capabilities"
import type { Exercise } from "@/api/exercises/catalog"
import { listVersions, type Version } from "@/api/exercises/versions"
import { ConfirmActionDialog } from "@/components/exercises/ConfirmActionDialog"
import { DeployTestDialog } from "@/components/exercises/DeployTestDialog"
import { DraftVariants } from "@/components/exercises/DraftFields"
import { EditorPositionProvider, useEditorValidationFocus } from "@/components/exercises/EditorPosition"
import { ArchivedBanner, VersionBanner } from "@/components/exercises/ExerciseBanners"
import { ExerciseGeneralFields } from "@/components/exercises/ExerciseGeneralFields"
import { ExerciseHeader, type HeaderBadge, type HeaderMode, type TestVariantOption } from "@/components/exercises/ExerciseHeader"
import { ExportDialog } from "@/components/exercises/ExportDialog"
import { HistoryDialog } from "@/components/exercises/HistoryDialog"
import { SnapshotDialog } from "@/components/exercises/SnapshotDialog"
import { useExerciseActions, type DeployTarget } from "@/components/exercises/useExerciseActions"
import { useExerciseEditor } from "@/components/exercises/useExerciseEditor"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { LoadingArea } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { DEFAULT_EDITOR_POSITION, editorPositionStorageKey, parseEditorPosition, type EditorPosition } from "@/lib/editorPosition"
import { exerciseHref } from "@/lib/exerciseRoutes"
import { canPublishExercise, exerciseBadgeKind, formatExerciseDate, formatExerciseDateTime } from "@/lib/exerciseStatus"
import { useExerciseLeaveGuard } from "@/lib/useExerciseLeaveGuard"
import { useRole } from "@/lib/useRole"
import { useUserNames } from "@/lib/userNames"

// eventId: owner event of a new exercise (from /new?event=…), used from Phase 2 on.
type Props = { exerciseId: string | null; versionId: string | null; eventId?: string | null }
type DialogName = "history" | "snapshot" | "revert" | "archive" | "delete" | "export"

export function ExerciseNotFound() {
  return <div className="frost-panel frost-in rounded-lg p-8 text-center">
    <p className="text-muted-foreground">{t("admin.exDetail.notFound")}</p>
    <Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">{t("admin.exDetail.back")}</Link>
  </div>
}

export function ExercisePage(props: Props) {
  const { isLoading } = useRole()
  if (isLoading) return <LoadingArea className="h-full" label={t("admin.loading")} />
  return <ExerciseScreen {...props} />
}

function ExerciseMeta({ exercise, version, isVersion, publishedAt }: {
  exercise: Exercise | null
  version: Version | null
  isVersion: boolean
  publishedAt: string | null
}) {
  const names = useUserNames([version?.CreatedBy])
  let text: string | null
  if (!exercise) {
    text = null
  } else if (isVersion && version) {
    const author = version.CreatedBy ? names[version.CreatedBy]?.name : undefined
    text = [t(`admin.exHistory.kind.${version.Status}`), formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt), author]
      .filter(Boolean).join(" · ")
  } else {
    // Publication info only; Exercise.UpdatedAt does not track working-copy edits.
    text = publishedAt ? t("admin.exPage.meta.published").replace("{date}", formatExerciseDate(publishedAt)) : null
  }
  return text ? <span className="text-xs text-muted-foreground">{text}</span> : null
}

function ExerciseScreen({ exerciseId, versionId }: Props) {
  const { can, me } = useRole()
  const permissions = {
    write: can("exercises.write"), publish: can("exercises.publish"),
    delete: can("exercises.delete"), export: can("exercises.export"),
  }
  const isVersion = versionId !== null
  const userId = me?.ID ?? null
  const [mode, setMode] = useState<"view" | "edit">(exerciseId ? "view" : "edit")
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [deploy, setDeploy] = useState<DeployTarget | null>(null)
  const [laboratories, setLaboratories] = useState(false)
  const [published, setPublished] = useState<{ versionId: string; at: string | null } | null>(null)
  const [position, setPosition] = useState<EditorPosition>(DEFAULT_EDITOR_POSITION)
  const [leaveOffline, setLeaveOffline] = useState(false)
  const { formRef, focusField } = useEditorValidationFocus()

  const editor = useExerciseEditor({
    exerciseId,
    versionId,
    editable: !isVersion && mode === "edit" && permissions.write,
    canWrite: permissions.write,
    userId,
    onCreated: (createdExercise) => {
      // Not router.replace: /new → /detail is another route segment and would remount the editor.
      window.history.replaceState(null, "", exerciseHref(createdExercise.ID))
      toast.success(t("admin.exPage.toast.created"))
    },
    onPendingRestored: () => setMode("edit"),
  })
  const exercise = editor.exercise
  const archived = Boolean(exercise?.ArchivedAt)
  const editing = !isVersion && !archived && mode === "edit" && permissions.write
  const saveStatus = editor.autosave.status
  const leave = useExerciseLeaveGuard(editing && exercise !== null && (saveStatus === "pending" || saveStatus === "saving" || saveStatus === "error"))
  const actions = useExerciseActions({
    editor, canWrite: permissions.write, canDelete: permissions.delete, setMode, setPosition, focusField,
    allowNavigation: leave.allowNavigation,
  })

  const positionKey = userId && exercise ? editorPositionStorageKey(userId, exercise.ID) : null
  useEffect(() => {
    if (!positionKey) return
    let stored: EditorPosition | null = null
    try { stored = parseEditorPosition(window.localStorage.getItem(positionKey)) } catch { /* storage unavailable */ }
    // Syncing from external storage once the key is known (the exercise loads async).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPosition(stored)
  }, [positionKey])

  function updatePosition<K extends keyof EditorPosition>(key: K, value: EditorPosition[K]) {
    setPosition((current) => {
      const next = { ...current, [key]: value }
      if (positionKey) {
        try { window.localStorage.setItem(positionKey, JSON.stringify(next)) } catch { /* best effort */ }
      }
      return next
    })
  }

  useEffect(() => {
    if (!permissions.write || isVersion) return
    let cancelled = false
    getExerciseCapabilities()
      .then((capabilities) => { if (!cancelled) setLaboratories(capabilities.Laboratories) })
      .catch(() => { if (!cancelled) setLaboratories(false) })
    return () => { cancelled = true }
  }, [permissions.write, isVersion])

  const currentId = exercise?.ID ?? null
  const publishedVersionId = exercise?.PublishedVersionID ?? null
  useEffect(() => {
    if (!currentId || !publishedVersionId) return
    let cancelled = false
    listVersions(currentId)
      .then((versions) => {
        if (!cancelled) setPublished({ versionId: publishedVersionId, at: versions.find((v) => v.ID === publishedVersionId)?.PublishedAt ?? null })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [currentId, publishedVersionId])
  const publishedAt = published && published.versionId === publishedVersionId ? published.at : null

  useEffect(() => {
    if (!leave.destination) return
    let cancelled = false
    void editor.autosave.flush().then((ok) => {
      if (cancelled) return
      if (ok) leave.finishLeave()
      else setLeaveOffline(true)
    })
    return () => { cancelled = true }
    // React to a new leave request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leave.destination])

  const getTestVariants = useCallback((): TestVariantOption[] =>
    editor.draftForm.getValues("Variants").map((variant, index) => ({
      index,
      label: `${t("admin.exDraft.variant")} ${index + 1}`,
      disabled: variant.Topology.Devices.length === 0,
    })), [editor.draftForm])

  if (!exerciseId && !permissions.write) {
    return <p role="alert" className="text-sm text-destructive">{t("admin.ex.create.forbidden")}</p>
  }
  if (editor.loadState === "loading") return <LoadingArea className="h-full" label={t("admin.loading")} />
  if (editor.loadState === "notFound") return <ExerciseNotFound />

  const headerMode: HeaderMode = isVersion ? "version" : exercise === null ? "new" : mode
  const version = editor.version
  const badge: HeaderBadge | null = isVersion && version
    ? { kind: "version", label: t("admin.exPage.badge.version").replace("{date}", formatExerciseDate(version.PublishedAt ?? version.CreatedAt)) }
    : exercise ? { kind: exerciseBadgeKind(exercise) } : null

  return <EditorPositionProvider position={position} onChange={updatePosition}>
    <Tabs value={position.tab} onValueChange={(value) => updatePosition("tab", value === "variants" ? "variants" : "general")}
      className="flex min-h-full w-full flex-col gap-4">
      <Link href="/" className="w-fit text-sm text-primary hover:underline">← {t("admin.exDetail.back")}</Link>
      <ExerciseHeader
        mode={headerMode}
        title={exercise?.Name ?? t("admin.ex.create.title")}
        badge={badge}
        saveStatus={saveStatus}
        permissions={permissions}
        archived={archived}
        publishable={exercise ? canPublishExercise(exercise) : false}
        revertable={Boolean(exercise?.PublishedVersionID && exercise.HasChanges)}
        busy={actions.busy}
        testAvailable={permissions.write && laboratories}
        getTestVariants={getTestVariants}
        usageEvents={actions.usageEvents.map((event) => event.Name)}
        onRetrySave={() => void editor.autosave.flush()}
        onCancelNew={() => void editor.autosave.discard()}
        onTest={(index) => void actions.test(index).then((target) => { if (target) setDeploy(target) })}
        onHistory={() => setDialog("history")}
        onEdit={() => setMode("edit")}
        onDone={() => void actions.done()}
        onPublish={() => void actions.publish()}
        onSnapshot={() => setDialog("snapshot")}
        onRevert={() => setDialog("revert")}
        onExport={() => setDialog("export")}
        onArchive={() => setDialog("archive")}
        onUnarchive={() => void actions.unarchive()}
        onDelete={() => setDialog("delete")}
      />
      {isVersion && version && exercise && <VersionBanner
        label={t("admin.exPage.version.banner").replace("{date}", formatExerciseDateTime(version.PublishedAt ?? version.CreatedAt))}
        canRestore={permissions.write && !archived}
        busy={actions.busy}
        onBack={() => void actions.openVersion(null)}
        onRestore={() => void actions.restore(version.ID)} />}
      {!isVersion && archived && <ArchivedBanner canUnarchive={permissions.write} busy={actions.busy} onUnarchive={() => void actions.unarchive()} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="general">{t("admin.ex.create.tab.general")}</TabsTrigger>
          <TabsTrigger value="variants">{t("admin.ex.create.tab.variants")}</TabsTrigger>
        </TabsList>
        <ExerciseMeta exercise={exercise} version={version} isVersion={isVersion} publishedAt={publishedAt} />
      </div>
      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col pt-5">
          <Form {...editor.draftForm}>
            <form ref={formRef} noValidate onSubmit={(event) => event.preventDefault()} className="flex flex-1 flex-col gap-5">
              <TabsContent value="general" forceMount className="m-0 flex-1 data-[state=inactive]:hidden">
                <ExerciseGeneralFields identityForm={editor.identityForm} draftForm={editor.draftForm} disabled={!editing || actions.busy} autoFocusName={!exerciseId} />
              </TabsContent>
              <TabsContent value="variants" forceMount className="m-0 flex-1 data-[state=inactive]:hidden">
                <DraftVariants form={editor.draftForm} disabled={!editing || actions.busy} />
              </TabsContent>
            </form>
          </Form>
        </CardContent>
      </Card>
    </Tabs>

    {dialog === "history" && exercise && <HistoryDialog exerciseId={exercise.ID} viewingVersionId={versionId}
      onClose={() => setDialog(null)}
      onView={(target) => { setDialog(null); void actions.openVersion(target) }} />}
    {dialog === "snapshot" && <SnapshotDialog busy={actions.busy} onCancel={() => setDialog(null)}
      onConfirm={(note) => void actions.snapshot(note).then((ok) => { if (ok) setDialog(null) })} />}
    <ConfirmActionDialog open={dialog === "revert"} busy={actions.busy}
      title={t("admin.exPage.revert.title")} description={t("admin.exPage.revert.description")} confirmLabel={t("admin.exPage.revert.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.revert().then((ok) => { if (ok) setDialog(null) })} />
    <ConfirmActionDialog open={dialog === "archive"} busy={actions.busy}
      title={t("admin.exPage.archive.title")} description={t("admin.exPage.archive.description")} confirmLabel={t("admin.exPage.archive.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.archive().then((ok) => { if (ok) setDialog(null) })} />
    <ConfirmActionDialog open={dialog === "delete"} busy={actions.busy} destructive
      title={t("admin.exPage.delete.title")} description={t("admin.exPage.delete.description")} confirmLabel={t("admin.exPage.delete.confirm")}
      onCancel={() => setDialog(null)} onConfirm={() => void actions.remove().then((ok) => { if (!ok) setDialog(null) })} />
    {dialog === "export" && exercise && <ExportDialog exerciseIds={[exercise.ID]} onClose={() => setDialog(null)} />}
    {deploy && <DeployTestDialog open onClose={() => setDeploy(null)} exerciseId={deploy.exerciseId}
      versionId={deploy.versionId} variantId={deploy.variantId} tasks={deploy.tasks} />}
    <Dialog open={leaveOffline} onOpenChange={(open) => { if (!open) { setLeaveOffline(false); leave.cancelLeave() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.exPage.leave.title")}</DialogTitle>
          <DialogDescription>{t("admin.exPage.leave.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setLeaveOffline(false); leave.cancelLeave() }}>{t("admin.exPage.leave.stay")}</Button>
          <Button type="button" onClick={() => { setLeaveOffline(false); leave.finishLeave() }}>{t("admin.exPage.leave.go")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </EditorPositionProvider>
}
