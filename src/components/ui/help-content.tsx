import type { ReactNode } from "react"

/**
 * Structured help of a field («?»): a short first sentence saying what the field is, then one line per allowed value
 * or mode with its name emphasised, then the default. Full sentences, each ending with a period.
 */
export type HelpContent = {
  /** One or two lines; the first says what the field is. */
  intro: string | string[]
  /** One line per value or mode: «term — text». */
  items?: { term: string; text: string }[]
  /** The default or the empty meaning («Типово вимкнено.»). */
  default?: string
}

/** A line always ends with a sentence mark. */
export function sentence(line: string): string {
  const text = line.trim()
  return text === "" || /[.!?…:]$/.test(text) ? text : `${text}.`
}

const introLines = (help: HelpContent) => (Array.isArray(help.intro) ? help.intro : [help.intro])

/** The plain text of a help (the tooltip's description for assistive technology, tests). */
export function helpPlain(help: HelpContent): string {
  return [...introLines(help).map(sentence), ...(help.items ?? []).map((item) => `${item.term} — ${sentence(item.text)}`), help.default ? sentence(help.default) : ""]
    .filter(Boolean).join(" ")
}

/** The bubble's body: intro, then a line per value with its name in bold, then the default. */
export function HelpBody({ help }: { help: HelpContent }): ReactNode {
  return <div data-help-structured className="space-y-1.5">
    {introLines(help).map((line) => <p key={line}>{sentence(line)}</p>)}
    {help.items && help.items.length > 0 && <ul className="space-y-0.5">
      {help.items.map((item) => <li key={item.term}><strong className="font-semibold">{item.term}</strong> — {sentence(item.text)}</li>)}
    </ul>}
    {help.default && <p className="opacity-80">{sentence(help.default)}</p>}
  </div>
}
