"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/utils/cn"
import { keepOwnScroll } from "./keep-own-scroll"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

/** Flat popover panel: border, no shadow (DS); never taller than the room on screen, its content scrolls (inside dialogs too). */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, onWheel, onTouchMove, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={8} {...keepOwnScroll({ onWheel, onTouchMove })}
      className={cn("z-(--ib-z-popover) max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain break-words rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground outline-none", className)}
      {...props} />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
