import { cn } from "@/utils/cn"
import { CREST_SRC } from "@/components/brand/Logo"
import "./spinner.css"
import { t } from "@/i18n/t"

const SIZE_CLASS = {
  sm: "crest-loader-sm",
  md: "crest-loader-md",
  lg: "crest-loader-lg",
  auto: "crest-loader-auto",
} as const

// Small inline activity indicator. Block loaders can show explicit progress text.
export function Spinner({
  size = "sm",
  label,
  className,
}: {
  size?: "sm" | "md" | "lg" | "auto"
  label?: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label={label ? undefined : t("admin.loading")}
      className={cn("inline-flex items-center justify-center leading-none", className)}
    >
      <span aria-hidden="true" className={cn("crest-loader", SIZE_CLASS[size])}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CREST_SRC} alt="" />
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}

// Block-level loading state: the crest is centered in the area being loaded
// and scales with that area's inline size instead of inheriting a page-wide size.
export function LoadingArea({ label, message, compact = false, className }: { label?: string; message?: string; compact?: boolean; className?: string }) {
  return <div className={cn("loading-area", compact ? "loading-area-compact" : "loading-area-panel", className)}><Spinner size="auto" label={label ?? message ?? t("admin.loading")} />{message && <span className="loading-area-label" aria-hidden="true">{message}</span>}</div>
}

// Full-screen centered loader for page-level loading states.
export function PageLoader({ label, message }: { label?: string; message?: string }) {
  return (
    <div className="loading-area loading-area-page fixed inset-0 z-50 bg-background">
      <Spinner size="auto" label={label ?? message ?? t("admin.loading")} />
      {message && <span className="loading-area-label" aria-hidden="true">{message}</span>}
    </div>
  )
}
