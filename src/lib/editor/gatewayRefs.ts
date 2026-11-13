/**
 * gatewayRefs.ts — what names a gateway by its name, and how that follows a rename or a removal. A gateway is referenced
 * by interface addresses and default gateways (`AddressRef`, `GatewayRef`), by route destinations and next hops
 * (`DstRef`, `ViaRef`) of the devices of the variant, and by the placeholders of its tasks (`Placeholders[].Gateway`).
 *   rename: every such name follows the new one;
 *   remove: address, gateway and route references are cleared (the field goes back to «Вручну», empty), and a placeholder
 *           that named it keeps its kind but loses the gateway («не обрано»), so the task shows an error beside the picker.
 */
import type { UseFormReturn } from "react-hook-form"
import type { DraftFormValues } from "@/lib/exerciseSchemas"

type Variant = DraftFormValues["Variants"][number]
type Devices = Variant["Topology"]["Devices"]
type Tasks = Variant["Tasks"]
type Interface = Devices[number]["Interfaces"][number]

export type GatewayRefUse = { addresses: number; routes: number; placeholders: number }

export function countGatewayRefs(devices: Devices, tasks: Tasks, name: string): GatewayRefUse {
  const use: GatewayRefUse = { addresses: 0, routes: 0, placeholders: 0 }
  for (const device of devices) {
    for (const iface of device.Interfaces) {
      if (iface.IP.AddressRef?.Gateway === name) use.addresses += 1
      if (iface.IP.GatewayRef?.Gateway === name) use.addresses += 1
      for (const route of iface.IP.Routes ?? []) {
        if (route.DstRef?.Gateway === name) use.routes += 1
        if (route.ViaRef?.Gateway === name) use.routes += 1
      }
    }
  }
  for (const task of tasks) for (const placeholder of task.Placeholders ?? []) if (placeholder.Gateway === name) use.placeholders += 1
  return use
}

function mapInterface(iface: Interface, from: string, to: string | null): Interface {
  const ip = iface.IP
  const addressHit = ip.AddressRef?.Gateway === from
  const gatewayHit = ip.GatewayRef?.Gateway === from
  const routes = (ip.Routes ?? []).map((route) => {
    let next = route
    if (route.DstRef?.Gateway === from) next = to === null ? { ...next, DstRef: null, Dst: "" } : { ...next, DstRef: { ...route.DstRef, Gateway: to } }
    if (route.ViaRef?.Gateway === from) next = to === null ? { ...next, ViaRef: null, Via: "" } : { ...next, ViaRef: { ...route.ViaRef, Gateway: to } }
    return next
  })
  const routesChanged = routes.some((route, index) => route !== (ip.Routes ?? [])[index])
  if (!addressHit && !gatewayHit && !routesChanged) return iface
  return { ...iface, IP: {
    ...ip,
    ...(addressHit ? (to === null ? { AddressRef: null, Addresses: [""] } : { AddressRef: { ...ip.AddressRef!, Gateway: to } }) : {}),
    ...(gatewayHit ? (to === null ? { GatewayRef: null, Gateway: "" } : { GatewayRef: { ...ip.GatewayRef!, Gateway: to } }) : {}),
    Routes: routes,
  } }
}

/** `to` = the new name, or null to clear the references (the gateway is removed). Returns new arrays; untouched items are the same objects. */
export function rewriteGatewayRefs(devices: Devices, tasks: Tasks, from: string, to: string | null): { devices: Devices; tasks: Tasks } {
  return {
    devices: devices.map((device) => {
      const interfaces = device.Interfaces.map((iface) => mapInterface(iface, from, to))
      return interfaces.some((iface, index) => iface !== device.Interfaces[index]) ? { ...device, Interfaces: interfaces } : device
    }),
    tasks: tasks.map((task) => {
      if (!(task.Placeholders ?? []).some((placeholder) => placeholder.Gateway === from)) return task
      return { ...task, Placeholders: task.Placeholders.map((placeholder) => placeholder.Gateway === from ? { ...placeholder, Gateway: to ?? "" } : placeholder) }
    }),
  }
}

/**
 * Renames a gateway device and, in the same write, every reference to it in the variant (interface addresses, default
 * gateways, routes, placeholders of the tasks). The caller has already checked the name.
 */
export function renameGatewayInForm(form: Pick<UseFormReturn<DraftFormValues>, "getValues" | "setValue">, variantIndex: number, deviceId: string, name: string): void {
  const variant = form.getValues(`Variants.${variantIndex}`)
  const current = variant.Topology.Devices.find((device) => device.ID === deviceId)
  if (!current || current.Name === name) return
  const rewritten = rewriteGatewayRefs(variant.Topology.Devices, variant.Tasks, current.Name, name)
  form.setValue(`Variants.${variantIndex}.Topology.Devices`, rewritten.devices.map((device) => device.ID === deviceId ? { ...device, Name: name } : device), { shouldDirty: true, shouldValidate: true })
  if (rewritten.tasks.some((task, index) => task !== variant.Tasks[index])) form.setValue(`Variants.${variantIndex}.Tasks`, rewritten.tasks, { shouldDirty: true, shouldValidate: true })
}
