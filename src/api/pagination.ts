/**
 * pagination.ts — response-side shapes shared by every paginated admin list.
 * Mirrors the backend's pkg/pagination generics (CursorPage / OffsetPage):
 * the wire shape is always `Items` + `Total`, with the cursor/offset extras.
 *
 * NextCursor is OPTIONAL: it is absent (undefined) when there is no further
 * page — its presence is the "has more" signal (there is no separate HasMore
 * flag anymore).
 */

export type CursorPage<T> = {
  Items: T[]
  Total: number
  NextCursor?: string
  PrevCursor?: string
}

export type OffsetPage<T> = {
  Items: T[]
  Total: number
  Page: number
  PageSize: number
}
