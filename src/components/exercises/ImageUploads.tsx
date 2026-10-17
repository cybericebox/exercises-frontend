"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react"
import type { UseFormReturn } from "react-hook-form"
import { uploadImage, type ImageUploadStage } from "@/api/exercises/images"
import type { DraftFormValues } from "@/lib/exerciseSchemas"
import { imageUploadErrorMessage } from "@/lib/imageErrors"

export type ImageUploadProgress = { percent: number; stage: ImageUploadStage }

/** The upload state of one device's image. */
export type DeviceImageUpload = {
  progress: ImageUploadProgress | null
  error: string | null
  failedFile: File | null
  /** The author changed the image (or removed the device) while the upload ran: the uploaded image was not used. */
  dropped: boolean
}

const IDLE: DeviceImageUpload = { progress: null, error: null, failedFile: null, dropped: false }

/**
 * The image uploads of one editor, keyed by the stable device id. It lives above the device cards, so collapsing
 * a section or switching panels or devices never stops an upload; only «Скасувати» or leaving the editor does.
 */
export class ImageUploadStore {
  private states = new Map<string, DeviceImageUpload>()
  private controllers = new Map<string, AbortController>()
  private listeners = new Set<() => void>()

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
    form: Pick<UseFormReturn<DraftFormValues>, "getValues" | "setValue">
  }): Promise<void> {
    if (this.controllers.has(deviceId)) return
    const at = locateDevice(form.getValues("Variants") ?? [], deviceId, variantId)
    if (!at) return
    const device = form.getValues(`Variants.${at.variant}.Topology.Devices.${at.device}`)
    const before = device.Image ?? ""
    const name = device.Name || file.name.replace(/\.tar$/i, "")
    const abort = new AbortController()
    this.controllers.set(deviceId, abort)
    this.set(deviceId, { progress: { percent: 0, stage: "uploading" }, error: null, failedFile: null, dropped: false })
    try {
      const reference = await uploadImage(exerciseId, file, name, (percent, stage) => {
        if (!abort.signal.aborted) this.set(deviceId, { progress: { percent, stage } })
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
    this.set(deviceId, { progress: null })
  }

  /** Leaving the editor stops every upload. */
  abortAll() {
    this.controllers.forEach((controller) => controller.abort())
    this.controllers.clear()
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

type ImageUploadsValue = { store: ImageUploadStore; canWrite: boolean }

const ImageUploadsContext = createContext<ImageUploadsValue | null>(null)

/** Mounted once per editor (above every device card): uploads outlive the device cards; leaving the editor aborts them. */
export function ImageUploadsProvider({ canWrite, children }: { canWrite: boolean; children: React.ReactNode }) {
  const [store] = useState(() => new ImageUploadStore())
  useEffect(() => () => store.abortAll(), [store])
  return <ImageUploadsContext.Provider value={{ store, canWrite }}>{children}</ImageUploadsContext.Provider>
}

/**
 * The editor's upload store and whether the user may write (so may check images). Without a provider (a card
 * rendered on its own) the card keeps its own store, and its uploads stop when it unmounts.
 */
export function useImageUploads(): ImageUploadsValue {
  const shared = useContext(ImageUploadsContext)
  const [own] = useState(() => shared ? null : new ImageUploadStore())
  useEffect(() => own ? () => own.abortAll() : undefined, [own])
  return shared ?? { store: own as ImageUploadStore, canWrite: true }
}

/** The upload state of one device, re-rendered on every change. */
export function useDeviceImageUpload(store: ImageUploadStore, deviceId: string): DeviceImageUpload {
  return useSyncExternalStore(store.subscribe, () => store.get(deviceId), () => IDLE)
}
