// Static-export-safe i18n wrapper.
// Build-time JSON import — no runtime locale provider, no locale switching.
//
// Two catalogs are maintained: messages/en.json (source of truth for the key set)
// and messages/uk.json (the ACTIVE language). The UI ships in Ukrainian; English
// is kept in sync as the reference/fallback. To switch the active language, change
// the `active` import below. Copy both catalogs to other apps per the DS sync
// procedure (see README).
import baseEn from "../../messages/en.json"
import baseUk from "../../messages/uk.json"
import { keepBrand } from "./brand"
// The editor's messages live in one file per package (prefix ed.<package>.), so parallel work never edits one big
// file: shell and ui (foundation), a (general, variants, wizard), b (tasks), c (infrastructure), d (test lab).
import shellEn from "../../messages/editor/shell.en.json"
import shellUk from "../../messages/editor/shell.uk.json"
import uiEn from "../../messages/editor/ui.en.json"
import uiUk from "../../messages/editor/ui.uk.json"
import aEn from "../../messages/editor/a.en.json"
import aUk from "../../messages/editor/a.uk.json"
import bEn from "../../messages/editor/b.en.json"
import bUk from "../../messages/editor/b.uk.json"
import cEn from "../../messages/editor/c.en.json"
import cUk from "../../messages/editor/c.uk.json"
import dEn from "../../messages/editor/d.en.json"
import dUk from "../../messages/editor/d.uk.json"

const en = { ...baseEn, ...shellEn, ...uiEn, ...aEn, ...bEn, ...cEn, ...dEn }
const uk = { ...baseUk, ...shellUk, ...uiUk, ...aUk, ...bUk, ...cUk, ...dUk }

// `en` defines the canonical key set; `uk` is what users see.
const active = uk
const fallback = en

type MessageKey = keyof typeof en

export type MessageVars = Record<string, string | number>

/**
 * Translate a message key to the active-language (Ukrainian) string.
 * Falls back to English, then to the key itself (safe for static export).
 * `{name}` placeholders are filled from `vars`.
 */
export function t(key: MessageKey | string, vars?: MessageVars): string {
  const a = (active as Record<string, string>)[key]
  const text = a ?? (fallback as Record<string, string>)[key] ?? key
  if (!vars) return keepBrand(text)
  return keepBrand(text.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match))
}
