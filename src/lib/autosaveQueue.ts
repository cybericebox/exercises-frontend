/**
 * autosaveQueue.ts — serialized, coalescing autosave.
 *
 * markChanged() (re)starts the debounce timer; flush() sends at once. At most
 * one save runs at a time. save() reads the latest values itself, so all edits
 * made while a request is in flight go out in exactly one follow-up request.
 * save() resolves false when nothing can be persisted yet (a new exercise
 * without a valid name): the changes stay pending and status returns to idle.
 *
 * discard()/dispose() bump a generation counter: an in-flight save that settles
 * after a discard/dispose is a stale result — it must not resurrect `dirty`,
 * emit a status, or fire onSaved for changes the caller already abandoned (the
 * caller can still `await discard()` to know when that stale request is done,
 * e.g. before navigating away).
 */
export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"

export type AutosaveQueueOptions = {
  delayMs: number
  save: () => Promise<boolean>
  onStatus: (status: AutosaveStatus) => void
  onSaved?: () => void
}

export class AutosaveQueue {
  private dirty = false
  private running: Promise<boolean> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private disposed = false

  constructor(private readonly options: AutosaveQueueOptions) {}

  markChanged(): void {
    if (this.disposed) return
    this.dirty = true
    if (!this.running) this.options.onStatus("pending")
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      // drain() already catches save() rejections and reports "error"; this guard is a
      // last resort so a bug elsewhere (e.g. onStatus throwing) can't surface as an
      // unhandled rejection from a bare `void this.flush()`.
      this.flush().catch(() => this.options.onStatus("error"))
    }, this.options.delayMs)
  }

  flush(): Promise<boolean> {
    this.clearTimer()
    if (this.disposed) return Promise.resolve(true)
    if (this.running) return this.running.then(() => this.flush())
    if (!this.dirty) return Promise.resolve(true)
    const generation = this.generation
    this.running = this.drain(generation).finally(() => { this.running = null })
    return this.running
  }

  hasUnsaved(): boolean {
    return this.dirty || this.running !== null
  }

  /**
   * Forget pending changes (the user abandoned them) and start a new generation, so
   * any save already in flight can no longer mark the queue dirty, emit a status, or
   * fire onSaved when it settles. Returns a promise that resolves once that in-flight
   * save (if any) has settled, so a caller can wait for it before e.g. navigating away.
   */
  discard(): Promise<void> {
    this.clearTimer()
    this.dirty = false
    this.generation += 1
    const running = this.running
    if (!running) {
      this.options.onStatus("idle")
      return Promise.resolve()
    }
    return running.then(() => undefined, () => undefined)
  }

  /** Like discard(), but permanent: the queue accepts no further markChanged()/flush() calls. */
  dispose(): void {
    this.clearTimer()
    this.dirty = false
    this.generation += 1
    this.disposed = true
  }

  private async drain(generation: number): Promise<boolean> {
    while (this.dirty) {
      this.dirty = false
      this.options.onStatus("saving")
      let persisted: boolean
      try {
        persisted = await this.options.save()
      } catch {
        if (this.generation !== generation) return true // discarded/disposed while in flight — stale result, ignore
        this.dirty = true
        this.options.onStatus("error")
        return false
      }
      if (this.generation !== generation) return true // discarded/disposed while in flight — stale result, ignore
      if (!persisted) {
        this.dirty = true
        this.options.onStatus("idle")
        return false
      }
    }
    if (this.generation !== generation) return true
    this.options.onStatus("saved")
    this.options.onSaved?.()
    return true
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
}
