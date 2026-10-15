"use client"

import * as React from "react"
import * as Popover from "@radix-ui/react-popover"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { t } from "@/i18n/t"
import { HoverTooltip } from "@/components/ui/hover-tooltip"

// Same picker as event-frontend's EventDateTimePicker (copied, not imported):
// a calendar popover with keyboard grid navigation and a time row that works
// before a day is picked. Values are wall-clock "YYYY-MM-DDTHH:mm" strings in
// the viewer's own time zone (shown next to the value).

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
  allowClear?: boolean
}

type Part = "hour" | "minute"
const PART_MAX: Record<Part, number> = { hour: 23, minute: 59 }
const WEEKDAY_KEYS = ["ui.weekday.mon", "ui.weekday.tue", "ui.weekday.wed", "ui.weekday.thu", "ui.weekday.fri", "ui.weekday.sat", "ui.weekday.sun"]
const pad = (value: number) => String(value).padStart(2, "0")
const datePart = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

function selectedDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(date).replace(/\s*р\.$/, "")
}

// Same day in another month, clamped to that month's last day.
function addMonths(date: Date, months: number): Date {
  const last = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate()
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), last))
}

function moveDay(date: Date, key: string, shift: boolean): Date | null {
  switch (key) {
    case "ArrowLeft": return addDays(date, -1)
    case "ArrowRight": return addDays(date, 1)
    case "ArrowUp": return addDays(date, -7)
    case "ArrowDown": return addDays(date, 7)
    case "Home": return addDays(date, -((date.getDay() + 6) % 7))
    case "End": return addDays(date, 6 - (date.getDay() + 6) % 7)
    case "PageUp": return addMonths(date, shift ? -12 : -1)
    case "PageDown": return addMonths(date, shift ? 12 : 1)
    default: return null
  }
}

function timePart(raw: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return null
  const value = Number(raw)
  return value <= max ? value : null
}

function zoneLabel(at: Date = new Date()): { zone: string; offset: string } {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? ""
  return { zone, offset }
}

export const DateTimePicker = React.forwardRef<HTMLButtonElement, Props>(function DateTimePicker({ value, onChange, allowClear, onBlur, disabled, id, name, "aria-label": ariaLabel, "aria-describedby": describedBy, "aria-invalid": invalid, ...rest }, ref) {
  const chosen = selectedDate(value)
  const [open, setOpen] = React.useState(false)
  const [focused, setFocused] = React.useState<Date>(() => chosen ?? new Date())
  const [month, setMonth] = React.useState<Date>(() => monthStart(chosen ?? new Date()))
  const [drafts, setDrafts] = React.useState<Record<Part, string> | null>(null)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const moved = React.useRef(false)
  const calendarId = React.useId()
  const { zone, offset } = zoneLabel(chosen ?? undefined)
  const time = { hour: chosen?.getHours() ?? 9, minute: chosen?.getMinutes() ?? 0 }
  const shown = drafts ?? { hour: pad(time.hour), minute: pad(time.minute) }
  const offsetDays = (monthStart(month).getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offsetDays + 1))
  const [today] = React.useState(() => datePart(new Date()))

  React.useEffect(() => {
    if (!open || !moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${datePart(focused)}"]`)?.focus()
  }, [focused, open])

  function openChange(next: boolean) {
    if (next) {
      const start = chosen ?? new Date()
      setFocused(start)
      setMonth(monthStart(start))
      setDrafts(null)
    }
    setOpen(next)
  }

  function emit(day: Date, parts: { hour: number; minute: number }) {
    onChange(`${datePart(day)}T${pad(parts.hour)}:${pad(parts.minute)}`)
  }

  function pick(day: Date) {
    setFocused(day)
    if (day.getMonth() !== month.getMonth()) setMonth(monthStart(day))
    emit(day, time)
  }

  function dayKey(event: React.KeyboardEvent<HTMLButtonElement>, day: Date) {
    const next = moveDay(day, event.key, event.shiftKey)
    if (!next) return
    event.preventDefault()
    moved.current = true
    setFocused(next)
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) setMonth(monthStart(next))
  }

  function changeMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setMonth(next)
    setFocused(new Date(next.getFullYear(), next.getMonth(), Math.min(focused.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())))
  }

  // Time works before a day is chosen too: it then applies to today.
  function commitPart(part: Part, raw: string) {
    if (drafts === null) return
    const parsed = timePart(raw, PART_MAX[part])
    setDrafts(null)
    if (parsed !== null) emit(chosen ?? new Date(), { ...time, [part]: parsed })
  }

  function typePart(part: Part, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 2)
    setDrafts({ ...shown, [part]: digits })
    if (digits.length === 2 && timePart(digits, PART_MAX[part]) !== null) emit(chosen ?? new Date(), { ...time, [part]: Number(digits) })
  }

  function partKey(event: React.KeyboardEvent<HTMLInputElement>, part: Part) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      setDrafts(null)
      const max = PART_MAX[part]
      emit(chosen ?? new Date(), { ...time, [part]: (time[part] + (event.key === "ArrowUp" ? 1 : -1) + max + 1) % (max + 1) })
    } else if (event.key === "Enter") {
      event.preventDefault()
      commitPart(part, event.currentTarget.value)
    }
  }

  return <Popover.Root open={open} onOpenChange={openChange}>
    <Popover.Trigger {...rest} ref={ref} id={id} name={name} type="button" aria-label={ariaLabel} aria-describedby={describedBy} aria-haspopup="dialog" data-invalid={invalid} disabled={disabled} onBlur={onBlur} className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50">
      <span className={`min-w-0 flex-1 truncate tabular-nums ${chosen ? "" : "text-placeholder"}`}>{chosen ? t("ui.dateTime.value", { date: dateLabel(chosen), time: `${pad(time.hour)}:${pad(time.minute)}` }) : t("ui.dateTime.placeholder")}</span>
      {chosen && <HoverTooltip text={zone} className="shrink-0"><span className="text-xs tabular-nums text-muted-foreground">{offset}</span></HoverTooltip>}
      <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="start" sideOffset={4} collisionPadding={8} aria-label={ariaLabel} className="z-[80] grid max-h-[var(--radix-popover-content-available-height)] w-[min(21rem,calc(100vw-1rem))] gap-2 overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground outline-none"
        onOpenAutoFocus={(event) => { event.preventDefault(); gridRef.current?.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus() }}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label={t("ui.dateTime.prevMonth")} onClick={() => changeMonth(-1)} className="rounded-md p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
          <strong id={`${calendarId}-month`} aria-live="polite" className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(month)}</strong>
          <button type="button" aria-label={t("ui.dateTime.nextMonth")} onClick={() => changeMonth(1)} className="rounded-md p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">{WEEKDAY_KEYS.map((key) => <span key={key} className="py-1">{t(key)}</span>)}</div>
        <div ref={gridRef} role="group" aria-labelledby={`${calendarId}-month`} className="grid grid-cols-7 gap-0.5">{days.map((day) => {
          const key = datePart(day)
          const isSelected = !!chosen && key === datePart(chosen)
          return <button key={key} data-day={key} type="button" tabIndex={key === datePart(focused) ? 0 : -1} aria-label={dateLabel(day)} aria-pressed={isSelected} aria-current={key === today ? "date" : undefined}
            onClick={() => pick(day)} onKeyDown={(event) => dayKey(event, day)}
            className={`h-8 rounded-md text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-primary ${key === today ? "font-semibold underline underline-offset-[3px]" : ""} ${isSelected ? "bg-primary text-primary-foreground" : day.getMonth() === month.getMonth() ? "text-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent"}`}>{day.getDate()}</button>
        })}</div>
        <div className="grid gap-3 border-t border-border pt-3">
          <div role="group" aria-label={t("ui.dateTime.time")} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t("ui.dateTime.time")}</span>
            {(["hour", "minute"] as const).map((part, index) => <span key={part} className="inline-flex items-center gap-1">
              {index > 0 && <span aria-hidden="true">:</span>}
              <input aria-label={t(`ui.dateTime.${part}`)} inputMode="numeric" autoComplete="off" maxLength={2} value={shown[part]}
                onFocus={(event) => event.currentTarget.select()} onChange={(event) => typePart(part, event.target.value)}
                onBlur={(event) => commitPart(part, event.currentTarget.value)} onKeyDown={(event) => partKey(event, part)}
                className="h-8 w-10 rounded-md border border-border bg-card text-center tabular-nums focus-visible:outline-2 focus-visible:outline-primary" />
            </span>)}
            <span className="ml-auto text-xs text-muted-foreground">{t("ui.dateTime.zone", { zone, offset })}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            {allowClear && chosen && <button type="button" onClick={() => { onChange(""); setOpen(false) }} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">{t("ui.dateTime.clear")}</button>}
            <Popover.Close type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--ib-action-hover)]">{t("ui.dateTime.done")}</Popover.Close>
          </div>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
})
