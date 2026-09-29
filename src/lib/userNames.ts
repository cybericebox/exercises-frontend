import { useState, useEffect } from "react"
import { apiGet } from "@/api/client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserName = {
  id: string
  name: string
  href: string
}

// ---------------------------------------------------------------------------
// Module-level promise cache
// ---------------------------------------------------------------------------
// Each id is fetched at most ONCE. The cache stores the in-flight (or already
// settled) Promise so concurrent callers share the same request.
const cache = new Map<string, Promise<UserName>>()

/**
 * Clear the module-level cache. Exported for test isolation only.
 * Do NOT call in production code.
 */
export function __clearUserNameCache(): void {
  cache.clear()
}

// ---------------------------------------------------------------------------
// fetchUserName
// ---------------------------------------------------------------------------

/**
 * Fetch the display name for a user by id.
 *
 * - Result is cached as a Promise so concurrent or subsequent calls for the
 *   same id share a single network request.
 * - On API failure: resolves (does NOT throw) to a fallback carrying the
 *   first 8 chars of the id as the name, so a list render is never broken by
 *   a missing user.
 */
export async function fetchUserName(id: string): Promise<UserName> {
  if (cache.has(id)) {
    return cache.get(id)!
  }

  const promise: Promise<UserName> = apiGet<{
    ID: string
    FirstName: string
    LastName: string
    Email: string
  }>("/api/users/" + id)
    .then((user) => {
      const name =
        `${user.FirstName ?? ""} ${user.LastName ?? ""}`.trim() || user.Email
      return { id, name, href: "/users/detail?id=" + id }
    })
    .catch((): UserName => {
      // Delete from cache so a subsequent call can retry the fetch instead of
      // returning this fallback forever (transient network errors are retriable).
      cache.delete(id)
      return {
        id,
        name: id.slice(0, 8),
        href: "/users/detail?id=" + id,
      }
    })

  cache.set(id, promise)
  return promise
}

// ---------------------------------------------------------------------------
// useUserNames
// ---------------------------------------------------------------------------

/**
 * React hook that resolves a list of user ids to a `Record<id, UserName>`.
 *
 * - Null / undefined entries are ignored.
 * - Duplicate ids are deduplicated — only one fetch per id.
 * - The returned map is populated incrementally: the component re-renders as
 *   each promise settles, so the list can render partial results immediately.
 * - A mounted-guard (`mounted` flag) ensures setState is never called after
 *   the consuming component unmounts, preventing the React "state update on
 *   unmounted component" warning.
 */
export function useUserNames(ids: (string | null | undefined)[]): Record<string, UserName> {
  const [names, setNames] = useState<Record<string, UserName>>({})

  // Build a stable string key that represents the DISTINCT sorted ids so the
  // effect only re-runs when the effective set of ids changes, not on every
  // render where the array reference is new but the contents are the same.
  const idsKey = [...new Set(ids.filter((id): id is string => id != null))]
    .sort()
    .join(",")

  useEffect(() => {
    if (!idsKey) return

    let mounted = true
    const distinct = idsKey.split(",")

    for (const id of distinct) {
      fetchUserName(id).then((userName) => {
        if (!mounted) return
        setNames((prev) => ({ ...prev, [id]: userName }))
      })
    }

    return () => {
      mounted = false
    }
  }, [idsKey])

  return names
}
