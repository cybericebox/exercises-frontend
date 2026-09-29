// Static-export-safe i18n wrapper.
// Build-time JSON import — no runtime locale provider, no locale switching.
//
// Two catalogs are maintained: messages/en.json (source of truth for the key set)
// and messages/uk.json (the ACTIVE language). The UI ships in Ukrainian; English
// is kept in sync as the reference/fallback. To switch the active language, change
// the `active` import below. Copy both catalogs to other apps per the DS sync
// procedure (see README).
import en from "../../messages/en.json"
import uk from "../../messages/uk.json"

// `en` defines the canonical key set; `uk` is what users see.
const active = uk
const fallback = en

type MessageKey = keyof typeof en

/**
 * Translate a message key to the active-language (Ukrainian) string.
 * Falls back to English, then to the key itself (safe for static export).
 */
export function t(key: MessageKey | string): string {
  const a = (active as Record<string, string>)[key]
  if (a !== undefined) return a
  const f = (fallback as Record<string, string>)[key]
  return f ?? key
}
