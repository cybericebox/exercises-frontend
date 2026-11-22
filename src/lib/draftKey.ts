/**
 * draftKey.ts — the AES-GCM key that seals the secret values (flag answers, environment values) of the browser drafts
 * (exercisePendingBuffer). The backend hands it out per session (POST /api/me/draft-key); it is imported as a
 * non-extractable CryptoKey and kept in this tab's memory only, never in IndexedDB or localStorage. Every tab fetches it
 * itself when the editor opens. A failed fetch (the backend is unreachable) is retried with a growing pause. 401 (not signed
 * in) keeps waiting: it is asked again when the tab gets the focus back (after a sign-in in another tab). Another 4xx
 * means a backend without draft keys: no more asking, and the editor says the secrets are not kept in the browser.
 * Any waiting state is also retried when the tab gets the focus back or becomes visible.
 *
 * The backend creates a key for a browser that has no draft-key cookie yet; two tabs asking at once would each create one
 * (the last cookie wins, a draft sealed with the other key is lost). So the request is serialized across the tabs of the
 * browser with the Web Locks API: the second tab asks after the first one's cookie is set and gets the same key. Within a
 * tab every caller shares one request in flight (StrictMode runs effects twice). Without navigator.locks only the in-tab
 * sharing applies.
 */
import { useSyncExternalStore } from "react"
import { ApiError } from "@/api/client"
import { fetchDraftKey } from "@/api/me/draftKey"

export type DraftKey = { id: string; key: CryptoKey }
/**
 * idle: never asked; loading: the first attempt runs; ready: the key is here; waiting: an attempt failed (unreachable, or not
 * signed in), the next one comes; unsupported: the backend has no draft keys.
 */
export type DraftKeyState = "idle" | "loading" | "ready" | "waiting" | "unsupported"

const FIRST_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000
const KEY_BYTES = 32
/** The Web Lock that serializes the key request across the tabs of the browser. */
export const DRAFT_KEY_LOCK = "cib-draft-key"

let state: DraftKeyState = "idle"
let current: DraftKey | null = null
let inflight: Promise<DraftKey | null> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let failures = 0
const listeners = new Set<() => void>()

function setState(next: DraftKeyState): void {
  if (state === next) return
  state = next
  for (const listener of [...listeners]) listener()
}

function decodeKey(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Not signed in: the key comes after a sign-in. */
function isSignedOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** A backend without the endpoint (404, 405) or another refusal that waiting does not change. */
function isUnsupported(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408 && error.status !== 429
}

let listening = false

/** A waiting key is asked for again when the tab gets the focus back or becomes visible (e.g. after a sign-in elsewhere). */
function listenForReturn(): void {
  if (listening || typeof window === "undefined") return
  listening = true
  const retry = () => {
    if (state !== "waiting" || inflight || current) return
    if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null }
    void attempt()
  }
  window.addEventListener("focus", retry)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") retry() })
}

/** The key request, one tab of the browser at a time. */
function requestKey(): Promise<{ ID: string; Key: string }> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  if (!locks?.request) return fetchDraftKey()
  return locks.request(DRAFT_KEY_LOCK, () => fetchDraftKey())
}

function scheduleRetry(): void {
  if (retryTimer !== null) return
  const delay = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, failures - 1))
  retryTimer = setTimeout(() => { retryTimer = null; void attempt() }, delay)
}

function attempt(): Promise<DraftKey | null> {
  if (current) return Promise.resolve(current)
  if (inflight) return inflight
  if (state !== "waiting") setState("loading")
  listenForReturn()
  inflight = (async () => {
    try {
      const answer = await requestKey()
      const bytes = decodeKey(answer.Key)
      if (!answer.ID || bytes.length !== KEY_BYTES) throw new Error("malformed draft key")
      const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
      current = { id: answer.ID, key }
      failures = 0
      setState("ready")
      return current
    } catch (error) {
      failures += 1
      if (isUnsupported(error)) setState("unsupported")
      else if (isSignedOut(error)) setState("waiting")
      else { setState("waiting"); scheduleRetry() }
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Starts fetching the key (the editor opened); retries on its own until it arrives. Does nothing when it is here or on its way. */
export function startDraftKey(): void {
  if (current || inflight || retryTimer !== null) return
  void attempt()
}

/** The key, or the outcome of the attempt under way (started when none is): null when it cannot be had right now. */
export function getDraftKey(): Promise<DraftKey | null> {
  return attempt()
}

/** The key when this tab already has it. */
export function currentDraftKey(): DraftKey | null {
  return current
}

export function draftKeyState(): DraftKeyState {
  return state
}

export function subscribeDraftKey(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The state of the key for a component (the "kept as soon as the server is reachable" note). */
export function useDraftKeyState(): DraftKeyState {
  return useSyncExternalStore(subscribeDraftKey, draftKeyState, () => "idle")
}

/** Tests only: forgets the key and the timers (listeners stay subscribed and hear the reset). */
export function resetDraftKeyForTests(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  current = null
  inflight = null
  failures = 0
  setState("idle")
}
