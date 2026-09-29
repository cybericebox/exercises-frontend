/**
 * list.ts — platform events for admin pickers (access level «Обраним подіям»).
 * GET /api/events?page=&pageSize=&sortBy=&sortDir= (admins).
 */
import { apiGet } from "@/api/client"
import type { OffsetPage } from "@/api/pagination"

export type EventOption = { ID: string; Name: string; Tag: string }

const PAGE_SIZE = 200

/** First page of events sorted by name — enough for a picker; search narrows it. */
export async function listEventOptions(search = ""): Promise<EventOption[]> {
  const params = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE), sortBy: "name", sortDir: "asc" })
  if (search.trim()) params.set("search", search.trim())
  const raw = await apiGet<OffsetPage<Partial<EventOption>> | null>(`/api/events?${params}`)
  return (raw?.Items ?? []).filter((item) => item.ID).map((item) => ({ ID: item.ID ?? "", Name: item.Name ?? "", Tag: item.Tag ?? "" }))
}
