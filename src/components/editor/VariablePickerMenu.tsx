"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { t } from "@/i18n/t";
import { cn } from "@/utils/cn";
import type { VariableDef } from "./variableUtils";

/**
 * Human label for a template variable.
 * Order: i18n `admin.notif.var.<name>` → VariableDef.description → name.
 * `t()` returns the key itself when neither catalog has it, which is how a
 * missing translation is detected.
 */
export function variableLabel(variable: VariableDef): string {
  const key = `admin.notif.var.${variable.name}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return variable.description || variable.name;
}

interface Props {
  variables: VariableDef[];
  onSelect: (name: string) => void;
  onClose: () => void;
  /** Live values shown as examples; falls back to VariableDef.example. */
  values?: Record<string, string>;
  /** Initial search text (e.g. the partial word typed after `{{`). */
  initialQuery?: string;
  className?: string;
}

/**
 * Searchable variable picker shared by the notification template editors.
 * Items prevent default on mousedown so the host editor keeps its selection;
 * insertion happens on click / Enter via `onSelect`.
 */
export function VariablePickerMenu({ variables, onSelect, onClose, values, initialQuery = "", className }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const entries = useMemo(
    () => variables.map((variable) => ({
      variable,
      label: variableLabel(variable),
      example: values?.[variable.name] ?? variable.example,
    })),
    [variables, values],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(({ variable, label }) =>
      [label, variable.name, variable.description ?? ""].some((text) => text.toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    const item = listRef.current?.querySelectorAll<HTMLElement>("[data-variable-item]")[activeIndex];
    item?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length) setActive(Math.min(activeIndex + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length) setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) onSelect(filtered[activeIndex].variable.name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className={cn(
        "z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-input bg-popover p-2 text-foreground shadow-lg",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <strong className="text-xs font-semibold">{t("admin.notif.varPicker.title")}</strong>
        <button
          type="button"
          aria-label={t("admin.notif.varPicker.close")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        placeholder={t("admin.notif.varPicker.search")}
        aria-label={t("admin.notif.varPicker.search")}
        autoFocus
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {filtered.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t("admin.notif.varPicker.empty")}</p>
      ) : (
        <div ref={listRef} data-testid="variable-picker-list" className="max-h-60 overflow-y-auto">
          {filtered.map(({ variable, label, example }, index) => (
            <button
              key={variable.name}
              type="button"
              data-variable-item
              aria-current={index === activeIndex ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => onSelect(variable.name)}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/40",
                index === activeIndex && "bg-secondary/40",
              )}
            >
              <strong className="block text-xs font-semibold text-foreground">{label}</strong>
              <code className="block font-mono text-[11px] text-primary">{variable.name}</code>
              {example && (
                <small className="block text-[11px] text-muted-foreground">
                  {t("admin.notif.editor.variableExample")}: {example}
                </small>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default VariablePickerMenu;
