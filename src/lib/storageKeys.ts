// Every browser-storage key (localStorage, sessionStorage, cookies) of this app lives here and starts with `cib_`.
// Keys with a scope are built by a function; the scope goes in after an underscore.

export const STORAGE_CLIENT_TOKEN_EXPIRES = "cib_client_token_expires"
export const STORAGE_INBOX_READ = "cib_inbox_read"
export const STORAGE_BACK = "cib_back"
export const STORAGE_EXERCISES_RETURN = "cib_exercises_return"
export const STORAGE_TOPOLOGY_INSPECTOR_WIDTH = "cib_topology_inspector_width"
const SITE_BANNER_DISMISSED = "cib_site_banner_dismissed"
const EXERCISE_POSITION = "cib_exercise_position"
const EXERCISE_PENDING = "cib_exercise_pending"

export function siteBannerDismissedKey(id: string | number, version: string | number = ""): string {
  return `${SITE_BANNER_DISMISSED}_${id}_${version}`
}

export function exercisePositionKey(userId: string, exerciseId: string): string {
  return `${EXERCISE_POSITION}_${userId}_${exerciseId}`
}

export function exercisePendingKey(userId: string, exerciseId: string): string {
  return `${EXERCISE_PENDING}_${userId}_${exerciseId}`
}
export const COOKIE_RETURN_TO = "cib_return_to"
