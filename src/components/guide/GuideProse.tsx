"use client"

import { useRouter } from "next/navigation"
import { Fragment, type MouseEvent } from "react"
import { GuideExamples } from "./GuideExamples"

/** In arkhiv.ts: where the full YAML/JSON example sits. */
export const EXAMPLES_MARKER = "<div data-guide-examples></div>"

/**
 * Renders a guide page body. The html comes from the trusted static content modules (src/content/guide), never from
 * users or the API. Clicks on internal /guide/ links go through the router (no full reload); the examples marker
 * is replaced by the live <GuideExamples/>.
 */
export function GuideProse({ html }: { html: string }) {
  const router = useRouter()

  function onClick(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement).closest("a")
    const href = anchor?.getAttribute("href")
    if (!anchor || !href || !href.startsWith("/guide/") || (anchor.target && anchor.target !== "_self")) return
    event.preventDefault()
    router.push(href)
  }

  const parts = html.split(EXAMPLES_MARKER)
  return <>
    {parts.map((part, index) => <Fragment key={index}>
      {index > 0 && <div className="g-slot"><GuideExamples /></div>}
      {part.trim() && <div className="g-prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: part }} />}
    </Fragment>)}
  </>
}
