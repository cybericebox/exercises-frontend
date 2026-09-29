"use client"

import { ExercisePage } from "@/components/exercises/ExercisePage"
import { useReturnContext } from "@/components/shell/ReturnContext"

export default function NewExercisePage() {
  // /new?event=<eventID> keeps the event scope (explicit query or stored return context).
  const { eventId } = useReturnContext()
  return <ExercisePage exerciseId={null} versionId={null} eventId={eventId} />
}
