import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { TABLE_HEAD_CELL } from "@/components/ui/table"
import { cn } from "@/utils/cn"

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
  return <th scope="col" aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"} className={TABLE_HEAD_CELL}>
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className="-mx-1.5 inline-flex h-7 items-center gap-1 rounded-sm px-1.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => onSort(field)}>
        {label}<Icon className={cn("h-3.5 w-3.5", !active && "opacity-50")} aria-hidden="true" />
      </button>
      {children}
    </span>
  </th>
}
