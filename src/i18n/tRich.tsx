import { Fragment, type ReactNode } from "react"
import { t } from "./t"

/**
 * Like `t`, but a variable may be a React node (a link, `<code>`, `<strong>`).
 * The `{name}` placeholders keep their place in the translated sentence.
 */
export function tRich(key: string, vars: Record<string, ReactNode>): ReactNode {
  const parts = t(key).split(/(\{\w+\})/g)
  return parts.map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    return <Fragment key={index}>{name && name in vars ? vars[name] : part}</Fragment>
  })
}
