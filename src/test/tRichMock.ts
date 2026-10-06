import { createElement, Fragment, type ReactNode } from "react"

// Test double for `tRich`: the key followed by every variable, so assertions see the nodes that were passed in.
export const tRich = (key: string, vars: Record<string, ReactNode>) => createElement(Fragment, null, key, ...Object.values(vars))
