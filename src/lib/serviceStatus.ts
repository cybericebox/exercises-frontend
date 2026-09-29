export type ServiceStatus = "up" | "suspect" | "down"

let status: ServiceStatus = "up"
const listeners = new Set<(status: ServiceStatus) => void>()
const restoredListeners = new Set<() => void>()

export function isServiceDown(): boolean {
  return status !== "up"
}

export function getServiceStatus(): ServiceStatus {
  return status
}

export function reportServiceUnavailable(): void {
  if (status !== "up") return
  status = "suspect"
  listeners.forEach((listener) => listener(status))
}

export function confirmServiceUnavailable(): void {
  if (status !== "suspect") return
  status = "down"
  listeners.forEach((listener) => listener(status))
}

export function reportServiceAvailable(): void {
  if (status === "up") return
  status = "up"
  listeners.forEach((listener) => listener(status))
  restoredListeners.forEach((listener) => listener())
}

export function subscribeServiceStatus(listener: (status: ServiceStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function onServiceRestored(listener: () => void): () => void {
  restoredListeners.add(listener)
  return () => restoredListeners.delete(listener)
}

export function isUnavailableStatus(status: number): boolean {
  return status >= 500 && status <= 599
}
