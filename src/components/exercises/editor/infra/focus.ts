import { fieldId } from "../fieldErrors"

const WAIT_MS = 1500

/**
 * Focuses the control of a form path once the view that holds it has mounted (a dialog section opens a moment after the
 * click). Looks every 50 ms for a short time, then scrolls the control to the middle. Returns a cancel function.
 */
export function focusFieldSoon(path: string | PropertyKey[]): () => void {
  const text = typeof path === "string" ? path : path.map(String).join(".")
  const started = Date.now()
  let timer = 0
  const attempt = () => {
    const target = document.getElementById(fieldId(text)) ?? document.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(text)}"]`)
    if (target) {
      target.scrollIntoView?.({ block: "center" })
      target.focus({ preventScroll: true })
      return
    }
    if (Date.now() - started < WAIT_MS) timer = window.setTimeout(attempt, 50)
  }
  timer = window.setTimeout(attempt, 0)
  return () => window.clearTimeout(timer)
}
