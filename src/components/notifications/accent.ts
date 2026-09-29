/**
 * accent.ts — accent colour of an in-app notification (copied from
 * admin-frontend notifications/editor/inAppOptions: toneColor + accentOf).
 */
const TONE_COLORS: Record<string, string> = {
  neutral: "#64748B",
  info: "#0091EA",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
}

/** Default accent for a tone; unknown tones fall back to neutral. */
export function toneColor(tone: string): string {
  return TONE_COLORS[tone] ?? TONE_COLORS.neutral
}

/** A valid hex AccentColor wins over the tone's default colour. */
export function accentOf(tmplLike: { Tone: string; AccentColor: string }): string {
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(tmplLike.AccentColor)
    ? tmplLike.AccentColor
    : toneColor(tmplLike.Tone)
}
