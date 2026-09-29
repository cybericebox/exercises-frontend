/** /detail?id=…[&version=…] — the one exercise page for every state. */
export function exerciseHref(id: string, versionId?: string | null): string {
  const params = new URLSearchParams({ id })
  if (versionId) params.set("version", versionId)
  return `/detail?${params}`
}
