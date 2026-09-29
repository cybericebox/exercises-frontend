/**
 * list.ts — platform events for admin pickers (access level «Обраним подіям»).
 * GET /api/events?page=&pageSize=&sortBy=&sortDir=&search= and GET /api/events/:id (admins).
 */
import { apiGet } from "@/api/client"
import type { OffsetPage } from "@/api/pagination"

export type EventOption = { ID: string; Name: string; Tag: string }

type RawEvent = Partial<EventOption> & { ArchiveAt?: string | null }

const PAGE_SIZE = 200

function toOption(item: RawEvent): EventOption {
  return { ID: item.ID ?? "", Name: item.Name ?? "", Tag: item.Tag ?? "" }
}

async function listRaw(params: Record<string, string>): Promise<RawEvent[]> {
  const raw = await apiGet<OffsetPage<RawEvent> | null>(`/api/events?${new URLSearchParams({ page: "1", ...params })}`)
  return (raw?.Items ?? []).filter((item) => item.ID)
}

/** First page of events sorted by name — enough for a picker; search narrows it. */
export async function listEventOptions(search = "", pageSize = PAGE_SIZE): Promise<EventOption[]> {
  const params: Record<string, string> = { pageSize: String(pageSize), sortBy: "name", sortDir: "asc" }
  if (search.trim()) params.search = search.trim()
  return (await listRaw(params)).map(toOption)
}

/**
 * The few events an admin most likely wants: the latest by availability date,
 * archived ones left out. The API has no "nearest to now" order, so this
 * over-fetches a little and trims.
 */
export async function listNearestEvents(limit = 4, now: Date = new Date()): Promise<EventOption[]> {
  const items = await listRaw({ pageSize: String(limit * 3), sortBy: "availableFrom", sortDir: "desc" })
  return items.filter((item) => !item.ArchiveAt || new Date(item.ArchiveAt) > now).slice(0, limit).map(toOption)
}

/** GET /api/events/:id — the name of an already selected event. */
export async function getEventOption(id: string): Promise<EventOption> {
  return toOption({ ID: id, ...(await apiGet<RawEvent>(`/api/events/${encodeURIComponent(id)}`)) })
}
