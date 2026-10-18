"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react"
import type { UseFormReturn } from "react-hook-form"
import { uploadImage, type ImageUploadDetail, type ImageUploadStage } from "@/api/exercises/images"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { readImageArchive } from "@/lib/imageArchive"
import { isGzip } from "@/lib/imageCompression"
import { imageUploadErrorMessage } from "@/lib/imageErrors"
import { useExerciseId } from "./ExerciseIdContext"

export type ImageUploadProgress = { percent: number; stage: ImageUploadStage; detail?: ImageUploadDetail }

/**
 * An archive dropped before the task exists: the File handle is kept here (nothing is read into memory) and checked
 * at once; the upload starts by itself when the task has an id. Lost on reload (a File cannot be stored).
 */
export type QueuedImage = {
  file: File
  /** "checking": the archive is being read; "ready": valid, waiting for the task. */
  status: "checking" | "ready"
  /** Layers of the archive; null for a .tar.gz, which is unpacked and read when the upload starts. */
  layers: number | null
}

/** The upload state of one device's image. */
export type DeviceImageUpload = {
  progress: ImageUploadProgress | null
  error: string | null
  failedFile: File | null
  /** The author changed the image (or removed the device) while the upload ran: the uploaded image was not used. */
  dropped: boolean
  queued: QueuedImage | null
  /** The archive being uploaded. */
  fileName: string | null
}

const IDLE: DeviceImageUpload = { progress: null, error: null, failedFile: null, dropped: false, queued: null, fileName: null }

type Form = Pick<UseFormReturn<DraftFormValues>, "getValues" | "setValue">
type Submission = { deviceId: string; variantId: string; file: File; isAdmin: boolean; form: Form }

/**
 * The image uploads of one editor, keyed by the stable device id. It lives above the device cards, so collapsing
 * a section or switching panels or devices never stops an upload; only «Скасувати» or leaving the editor does.
 */
export class ImageUploadStore {
  private states = new Map<string, DeviceImageUpload>()
  private controllers = new Map<string, AbortController>()
  private listeners = new Set<() => void>()
  private exerciseId: string | null = null
  private waiting = new Map<string, Submission>()
  /** Saves the working copy, which creates the task as soon as its name is valid. Set by the editor. */
  private flush: (() => Promise<boolean>) | null = null

  setFlush(flush: (() => Promise<boolean>) | null) {
    this.flush = flush
  }

  get = (deviceId: string): DeviceImageUpload => this.states.get(deviceId) ?? IDLE

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private set(deviceId: string, patch: Partial<DeviceImageUpload>) {
    this.states.set(deviceId, { ...this.get(deviceId), ...patch })
    this.listeners.forEach((listener) => listener())
  }

  running(deviceId: string): boolean {
    return this.controllers.has(deviceId)
  }

  /** The task the uploads belong to; an archive waiting for it starts when it appears. */
  setExerciseId(id: string | null) {
    if (this.exerciseId === id) return
    this.exerciseId = id
    if (id !== null) for (const deviceId of [...this.waiting.keys()]) this.startWaiting(deviceId)
  }

  /**
   * An archive for the device's image. With a task id the upload starts at once; without one (the task has no name
   * yet) the file is kept, checked at once, and the upload starts by itself when the task is created.
   */
  async submit(submission: Submission): Promise<void> {
    const { deviceId, file } = submission
    if (this.controllers.has(deviceId)) return
    if (this.exerciseId !== null) {
      this.waiting.delete(deviceId)
      return this.start({ ...submission, exerciseId: this.exerciseId })
    }
    this.waiting.set(deviceId, submission)
    this.set(deviceId, { queued: { file, status: "checking", layers: null }, error: null, failedFile: null, dropped: false })
    // A valid name creates the task now; with none, the author is asked for it.
    void this.flush?.()
    try {
      const layers = (await isGzip(file)) ? null : (await readImageArchive(file)).layers.length
      if (this.waiting.get(deviceId) !== submission) return
      this.set(deviceId, { queued: { file, status: "ready", layers } })
    } catch (cause) {
      if (this.waiting.get(deviceId) !== submission) return
      this.waiting.delete(deviceId)
      this.set(deviceId, { queued: null, error: imageUploadErrorMessage(cause, submission.isAdmin), failedFile: file })
      return
    }
    this.startWaiting(deviceId)
  }

  private startWaiting(deviceId: string) {
    const submission = this.waiting.get(deviceId)
    if (!submission || this.exerciseId === null || this.get(deviceId).queued?.status !== "ready") return
    this.waiting.delete(deviceId)
    void this.start({ ...submission, exerciseId: this.exerciseId })
  }

  /** Takes the waiting archive back (the × of the queued file). */
  unqueue(deviceId: string) {
    this.waiting.delete(deviceId)
    this.set(deviceId, { queued: null })
  }

  /** Clears the error and the file that failed. */
  dismissError(deviceId: string) {
    this.set(deviceId, { error: null, failedFile: null, dropped: false })
  }

  /**
   * Uploads the archive as the device's image. The result is written to the device found by its id when the
   * upload ends (wherever the device is then); a device whose image changed meanwhile keeps the author's value.
   */
  async start({ deviceId, variantId, file, exerciseId, isAdmin, form }: {
    deviceId: string
    variantId: string
    file: File
    exerciseId: string
    isAdmin: boolean
    form: Form
  }): Promise<void> {
    if (this.controllers.has(deviceId)) return
    const at = locateDevice(form.getValues("Variants") ?? [], deviceId, variantId)
    if (!at) return
    const device = form.getValues(`Variants.${at.variant}.Topology.Devices.${at.device}`)
    const before = device.Image ?? ""
    const name = device.Name || file.name.replace(/\.tar(\.gz)?$/i, "")
    const abort = new AbortController()
    this.controllers.set(deviceId, abort)
    this.set(deviceId, { progress: { percent: 0, stage: "uploading" }, error: null, failedFile: null, dropped: false, queued: null, fileName: file.name })
    try {
      const reference = await uploadImage(exerciseId, file, name, (percent, stage, detail) => {
        if (!abort.signal.aborted) this.set(deviceId, { progress: { percent, stage, detail } })
      }, abort.signal)
      if (abort.signal.aborted) return
      const now = locateDevice(form.getValues("Variants") ?? [], deviceId, variantId)
      // The author changed the image (or removed the device) while the upload ran: their change wins.
      if (!now || (form.getValues(`Variants.${now.variant}.Topology.Devices.${now.device}.Image`) ?? "") !== before) {
        this.set(deviceId, { dropped: true })
        return
      }
      form.setValue(`Variants.${now.variant}.Topology.Devices.${now.device}.Image`, reference, { shouldDirty: true, shouldValidate: true })
    } catch (cause) {
      const message = imageUploadErrorMessage(cause, isAdmin)
      if (message && !abort.signal.aborted) this.set(deviceId, { error: message, failedFile: file })
    } finally {
      if (this.controllers.get(deviceId) === abort) {
        this.controllers.delete(deviceId)
        this.set(deviceId, { progress: null })
      }
    }
  }

  /** «Скасувати»: stops the device's upload; the uploaded chunks stay and a new drop of the archive resumes. */
  cancel(deviceId: string) {
    this.controllers.get(deviceId)?.abort()
    this.controllers.delete(deviceId)
    this.waiting.delete(deviceId)
    this.set(deviceId, { progress: null, queued: null })
  }

  /** Leaving the editor stops every upload. */
  abortAll() {
    this.controllers.forEach((controller) => controller.abort())
    this.controllers.clear()
    this.waiting.clear()
  }
}

/** Where the device with this id is now: in its own variant when that still has it, otherwise the first variant that does. */
function locateDevice(variants: DraftFormValues["Variants"], deviceId: string, variantId: string): { variant: number; device: number } | null {
  let fallback: { variant: number; device: number } | null = null
  for (let variant = 0; variant < variants.length; variant++) {
    const device = (variants[variant]?.Topology?.Devices ?? []).findIndex((candidate) => candidate?.ID === deviceId)
    if (device < 0) continue
    if (variantId && variants[variant].ID === variantId) return { variant, device }
    fallback ??= { variant, device }
  }
  return fallback
}

type ImageUploadsValue = { store: ImageUploadStore; canWrite: boolean; focusName: () => void }

/** Default for «Ввести назву»: the name field is on the page. */
function focusNameField() {
  document.getElementById("exercise-name")?.focus()
}

const ImageUploadsContext = createContext<ImageUploadsValue | null>(null)

/** Mounted once per editor (above every device card): uploads outlive the device cards; leaving the editor aborts them. */
export function ImageUploadsProvider({ canWrite, flush, onNeedName, children }: {
  canWrite: boolean
  /** Saves the working copy (creates the task once its name is valid). */
  flush?: () => Promise<boolean>
  /** «Ввести назву»: shows the tab with the task name and focuses it. */
  onNeedName?: () => void
  children: React.ReactNode
}) {
  const [store] = useState(() => new ImageUploadStore())
  const exerciseId = useExerciseId()
  useEffect(() => () => store.abortAll(), [store])
  // The task appearing starts the archives that waited for it, whichever device card is on screen.
  useEffect(() => { store.setExerciseId(exerciseId) }, [store, exerciseId])
  useEffect(() => { store.setFlush(flush ?? null); return () => store.setFlush(null) }, [store, flush])
  return <ImageUploadsContext.Provider value={{ store, canWrite, focusName: onNeedName ?? focusNameField }}>{children}</ImageUploadsContext.Provider>
}

/**
 * The editor's upload store and whether the user may write (so may check images). Without a provider (a card
 * rendered on its own) the card keeps its own store, and its uploads stop when it unmounts.
 */
export function useImageUploads(): ImageUploadsValue {
  const shared = useContext(ImageUploadsContext)
  const [own] = useState(() => shared ? null : new ImageUploadStore())
  const exerciseId = useExerciseId()
  useEffect(() => own ? () => own.abortAll() : undefined, [own])
  useEffect(() => { own?.setExerciseId(exerciseId) }, [own, exerciseId])
  return shared ?? { store: own as ImageUploadStore, canWrite: true, focusName: focusNameField }
}

/** The upload state of one device, re-rendered on every change. */
export function useDeviceImageUpload(store: ImageUploadStore, deviceId: string): DeviceImageUpload {
  return useSyncExternalStore(store.subscribe, () => store.get(deviceId), () => IDLE)
}
