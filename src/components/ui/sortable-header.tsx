import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

export function SortableHeader({ label, field, activeField, direction, onSort, children }: {
  label: string
  field: string
  activeField: string
  direction: "asc" | "desc"
  onSort: (field: string) => void
  children?: React.ReactNode
}) {
  const active = field === activeField
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown
  return <th scope="col" aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}
    className="sticky top-0 z-10 bg-card px-3 py-2 text-left font-medium">
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => onSort(field)} aria-label={label}>
        {label}<Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {children}
    </span>
  </th>
}
