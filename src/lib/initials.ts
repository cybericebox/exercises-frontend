// Avatar initials: the first letters of the first and last name, uppercased
// (names may be stored in lowercase); else the e-mail's first letter; else "?".
export function initials(first?: string | null, last?: string | null, email?: string | null): string {
  const letter = (value?: string | null) => [...(value?.trim() ?? "")][0] ?? ""
  const upper = (value: string) => value.toLocaleUpperCase("uk-UA")
  return upper(letter(first) + letter(last)) || upper(letter(email)) || "?"
}
