"use client"

import * as React from "react"

import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/utils/cn"

type FileInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  file: File | null
  onFile: (file: File | null) => void
}

/**
 * The one file picker: a secondary button + the chosen name, in our language (the native control shows the
 * browser's English text). The real input stays in the DOM, visually hidden: the field label, keyboard
 * (Space / Enter) and focus ring work through it. A file can also be dropped on the control.
 */
export function FileInput({ file, onFile, className, disabled, ...props }: FileInputProps) {
  const [dragging, setDragging] = React.useState(false)
  return (
    <div
      className={cn("flex min-h-10 items-center gap-3 rounded-md border border-dashed border-border bg-card px-2 py-1", dragging && "border-ring bg-accent", className)}
      onDragOver={(event) => { if (!disabled) { event.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (!disabled) onFile(event.dataTransfer.files?.[0] ?? null)
      }}
    >
      <input
        {...props}
        type="file"
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={props.id}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background", disabled && "pointer-events-none opacity-50")}
      >
        {t("admin.exImport.chooseFile")}
      </label>
      <span className={cn("min-w-0 flex-1 truncate text-sm", file ? "text-foreground" : "text-muted-foreground")} title={file?.name}>
        {file ? file.name : t("admin.exImport.noFile")}
      </span>
    </div>
  )
}
