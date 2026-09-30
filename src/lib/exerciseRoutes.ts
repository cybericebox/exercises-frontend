/** /detail?id=…[&version=…] — the one exercise page for every state. */
export function exerciseHref(id: string, versionId?: string | null): string {
  const params = new URLSearchParams({ id })
  if (versionId) params.set("version", versionId)
  return `/detail?${params}`
}

/** /test?exercise=…&deploy=… — the testing page of a running test deploy. */
export function testLabHref(exerciseId: string, deployId: string): string {
  return `/test?${new URLSearchParams({ exercise: exerciseId, deploy: deployId })}`
}

/** /test?exercise=…&version=…&variant=… — the testing page, which starts the deploy of that variant. */
export function testLabStartHref(exerciseId: string, versionId: string, variantId: string): string {
  return `/test?${new URLSearchParams({ exercise: exerciseId, version: versionId, variant: variantId })}`
}
