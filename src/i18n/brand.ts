// Brand name typography: «Cyber ICE Box» never breaks across lines (see the CyberICEBox
// CLAUDE.md, «Brand name never wraps»). t() runs every string through keepBrand().
export const BRAND = "Cyber\u00A0ICE\u00A0Box"

// The wordmark renders «ICE» in its own span: «Cyber» + span + «Box», glued by no-break spaces.
export const BRAND_HEAD = "Cyber\u00A0"
export const BRAND_TAIL = "\u00A0Box"

const BRAND_RE = /Cyber[ \u00A0]+(ICE|Ice)[ \u00A0]+Box/g

/** Replace the spaces inside «Cyber ICE Box» with no-break spaces. */
export function keepBrand(text: string): string {
  return text.replace(BRAND_RE, "Cyber\u00A0$1\u00A0Box")
}
