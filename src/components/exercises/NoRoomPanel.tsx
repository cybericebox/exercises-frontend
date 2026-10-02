"use client"

import { useEffect, useState } from "react"

import { getExerciseCapabilities, type ResourcesConfig } from "@/api/exercises/capabilities"
import { listBookings, getRoom, type Booking } from "@/api/exercises/testLabs"
import type { NormalizedVariant, VersionResources } from "@/api/exercises/versions"
import { Button } from "@/components/ui/button"
import { LoadError } from "@/components/ui/load-error"
import { toast } from "@/components/ui/toast"
import { t } from "@/i18n/t"
import { formatClock } from "@/lib/bookingFormat"
import { nearestFromError, variantBookingSize } from "@/lib/noTestLabRoom"
import { BookingFormDialog } from "./BookingFormDialog"

/**
 * The test deploy was refused with 409 72509: no free resources now. Says when the nearest
 * window starts and offers to book it; the nearest window comes from the error, else from
 * GET /test-labs/room. «Спробувати ще раз» starts the test again.
 */
export function NoRoomPanel({ error, variant, resources, onRetry, className }: {
  error: unknown
  variant: NormalizedVariant
  resources: VersionResources | null
  onRetry: () => void
  className?: string
}) {
  const [config, setConfig] = useState<ResourcesConfig | null>(null)
  const [nearest, setNearest] = useState<string | null>(() => nearestFromError(error))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<Booking | null>(null)

  useEffect(() => {
    let cancelled = false
    void getExerciseCapabilities().then((caps) => {
      if (cancelled) return
      setConfig(caps.Resources)
      if (nearestFromError(error)) return
      const { size, largestDevice } = variantBookingSize(variant, resources, caps.Resources)
      void getRoom(size, largestDevice).then((room) => { if (!cancelled && room.NearestFrom) setNearest(room.NearestFrom) }, () => undefined)
    }, () => undefined)
    void listBookings().then((items) => { if (!cancelled) setBookings(items) }, () => undefined)
    return () => { cancelled = true }
  }, [error, variant, resources])

  const sized = config ? variantBookingSize(variant, resources, config) : null
  const message = booked
    ? t("exercises.book.bookedFrom", { time: formatClock(booked.From) })
    : nearest ? t("exercises.book.noRoomNow", { time: formatClock(nearest) }) : t("exercises.book.noRoomNowNoWindow")

  return <>
    <LoadError className={className} message={message} onRetry={onRetry}
    actions={!booked && nearest && sized ? <Button type="button" onClick={() => setBooking(true)}>{t("exercises.book.action")}</Button> : undefined} />
    {nearest && sized && <BookingFormDialog open={booking} start={nearest} size={sized.size} largestDevice={sized.largestDevice} active={bookings.length}
      onCancel={() => setBooking(false)}
      onBooked={(created) => { setBooking(false); setBooked(created); setBookings((items) => [...items, created]); toast.success(t("exercises.book.booked", { time: formatClock(created.From) })) }} />}
  </>
}
