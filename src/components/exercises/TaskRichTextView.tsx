import type { CSSProperties, ReactNode } from "react"

import type { ExternalTarget } from "@/lib/placeholderResolve"
import { cn } from "@/utils/cn"

type Node = Record<string, unknown>

const asNode = (value: unknown): Node | null => value && typeof value === "object" && !Array.isArray(value) ? value as Node : null

function safeHref(href: unknown): string | null {
  if (typeof href !== "string" || !href || /[\\\r\n\t]/.test(href) || href.startsWith("//")) return null
  if (href.startsWith("/") || href.startsWith("#")) return href
  try {
    const url = new URL(href)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null
  } catch { return null }
}

// A lab address may be plain http (reached over the VPN), so a variable link has its own check.
function variableHref(href: string | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function alignment(node: Node): CSSProperties | undefined {
  const format = node.format
  const value = typeof format === "string" ? format : ({ 1: "left", 2: "center", 3: "right", 4: "justify" } as Record<number, string>)[Number(format)]
  return value === "center" || value === "right" || value === "justify" ? { textAlign: value } : undefined
}

function formattedText(text: string, format: unknown): ReactNode {
  const flags = typeof format === "number" ? format : 0
  let result: ReactNode = text
  if (flags & 16) result = <code className="rounded bg-secondary/40 px-1 font-mono text-sm">{result}</code>
  if (flags & 32) result = <sub>{result}</sub>
  if (flags & 64) result = <sup>{result}</sup>
  if (flags & 128) result = <mark>{result}</mark>
  if (flags & 8) result = <u>{result}</u>
  if (flags & 4) result = <s>{result}</s>
  if (flags & 2) result = <em>{result}</em>
  if (flags & 1) result = <strong>{result}</strong>
  return result
}

const HEADING = {
  h1: "mb-2 text-2xl font-bold", h2: "mb-1.5 text-xl font-semibold", h3: "mb-1 text-lg font-medium",
  h4: "mb-1 text-base font-semibold", h5: "mb-1 text-sm font-semibold", h6: "mb-1 text-sm font-medium text-muted-foreground",
} as const

/** True when the document has at least one block. */
export function richTextHasBlocks(value: unknown): boolean {
  const root = asNode(asNode(value)?.root)
  return root?.type === "root" && Array.isArray(root.children) && root.children.length > 0
}

/**
 * TaskRichTextView — a task description as a participant reads it: the saved
 * rich-text document rendered read-only, every variable replaced by its value in
 * the lab. A link-form IP is an <a>; an external link is an <a> that opens the
 * web device through the platform proxy. Every value reads as plain inline text or a plain link.
 */
export function TaskRichTextView({ value, variables = {}, links = {}, external = {}, onOpenExternal, openingKey, className }: {
  value: unknown
  variables?: Record<string, string>
  links?: Record<string, string>
  external?: Record<string, ExternalTarget>
  onOpenExternal?: (target: ExternalTarget, key: string) => void
  /** The external variable whose link is being fetched. */
  openingKey?: string | null
  className?: string
}) {
  const root = asNode(asNode(value)?.root)
  if (root?.type !== "root" || !Array.isArray(root.children) || !root.children.length) return null

  function render(input: unknown, key: number, inCode = false): ReactNode {
    const node = asNode(input)
    if (!node) return null
    const children = Array.isArray(node.children) ? node.children.map((child, index) => render(child, index, inCode || node.type === "code")) : null
    switch (node.type) {
      case "text": return <span key={key}>{formattedText(typeof node.text === "string" ? node.text : "", node.format)}</span>
      case "variable": {
        const name = typeof node.varName === "string" ? node.varName : ""
        if (!name) return null
        const text = variables[name] ?? name
        const target = external[name]
        if (target) {
          // Looks like any link; the click opens the tab and mints the proxy link, so href is only a placeholder.
          return <a key={key} className="break-all text-primary underline underline-offset-2" href="#" target="_blank" rel="noopener noreferrer" data-task-variable={name}
            aria-busy={openingKey === name || undefined}
            onClick={(event) => { event.preventDefault(); if (onOpenExternal && !openingKey) onOpenExternal(target, name) }}>{text}</a>
        }
        const href = variableHref(links[name])
        if (href) return <a key={key} className="break-all text-primary underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer" data-task-variable={name}>{text}</a>
        const formats = Array.isArray(node.formats) ? node.formats : []
        return <span key={key} data-task-variable={name}
          style={{
            fontWeight: formats.includes("bold") ? 700 : undefined, fontStyle: formats.includes("italic") ? "italic" : undefined,
            textDecoration: [formats.includes("underline") ? "underline" : "", formats.includes("strikethrough") ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
          }}>{text}</span>
      }
      case "tab": return <span key={key}>{"\t"}</span>
      case "code-highlight": return <span key={key}>{typeof node.text === "string" ? node.text : ""}</span>
      case "linebreak": return inCode ? "\n" : <br key={key} />
      // An empty paragraph is a deliberate blank line, as in the editor.
      case "paragraph": return <p key={key} className="my-1" style={alignment(node)}>{children?.length ? children : <br />}</p>
      case "heading": {
        const tag = typeof node.tag === "string" && node.tag in HEADING ? node.tag as keyof typeof HEADING : null
        if (!tag) return null
        const Heading = tag
        return <Heading key={key} className={HEADING[tag]} style={alignment(node)}>{children}</Heading>
      }
      case "quote": return <blockquote key={key} className="my-2 rounded-md bg-[var(--ib-soft)] px-4 py-2 italic text-muted-foreground" style={alignment(node)}>{children}</blockquote>
      case "code": return <pre key={key} className="my-2 whitespace-pre-wrap rounded bg-secondary/40 p-3 font-mono text-sm"><code>{children}</code></pre>
      case "list": return node.listType === "number" ? <ol key={key} className="my-1 list-inside list-decimal">{children}</ol>
        : node.listType === "bullet" ? <ul key={key} className="my-1 list-inside list-disc">{children}</ul> : null
      case "listitem": return <li key={key} className="my-0.5">{children}</li>
      case "link":
      case "autolink": {
        const href = safeHref(node.url)
        if (!href) return <span key={key}>{children}</span>
        const outside = href.startsWith("https://")
        return <a key={key} className="text-primary underline underline-offset-2" href={href} target={outside ? "_blank" : undefined} rel={outside ? "noopener noreferrer" : undefined}>{children}</a>
      }
      default: return null
    }
  }

  return <div className={cn("text-sm leading-relaxed text-foreground", className)}>{root.children.map((child, index) => render(child, index))}</div>
}
