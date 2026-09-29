import { cn } from "@/utils/cn"

// One quiet, reusable mark for an empty collection, including empty search results.
export function EmptyState({ message, compact = false, className }: { message: string; compact?: boolean; className?: string }) {
  return (
    <div data-empty-state className={cn("flex flex-col items-center justify-center px-4 text-center", compact ? "min-h-24 gap-2 py-4" : "min-h-40 gap-3 py-8", className)}>
      <span className={cn("flex items-center justify-center rounded-xl border border-border bg-muted/30", compact ? "h-10 w-10" : "h-12 w-12")}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={cn("text-muted-foreground", compact ? "h-4 w-4" : "h-5 w-5")}>
          <path d="M4.5 5.5h15L21.5 18a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2l2-12.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M3.5 14h4.7l1.5 2h4.6l1.5-2h4.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
