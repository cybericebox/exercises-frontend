// Role labels: one canonical name per role, the same in every app (keys role.* in messages).
import { t } from "@/i18n/t"

// Platform roles stored on the user (AP Backend rbac.Role).
export const PLATFORM_ROLES = ["super_admin", "admin", "admin_viewer", "user"] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

// Event-local management roles by their stored code (AP Backend eventManagerModel.Role).
export const EVENT_ROLES = { 0: "owner", 1: "moderator", 2: "observer" } as const
export type EventRoleCode = keyof typeof EVENT_ROLES

/** Label of a platform role; an unknown role shows as is. */
export function roleLabel(role: string): string {
  return (PLATFORM_ROLES as readonly string[]).includes(role) ? t(`role.${role}`) : role
}

/** Label of an event management role by its code; an unknown code shows as is. */
export function eventRoleLabel(code: number): string {
  const name = EVENT_ROLES[code as EventRoleCode]
  return name ? t(`role.event.${name}`) : String(code)
}
