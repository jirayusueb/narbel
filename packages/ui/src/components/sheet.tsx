"use client";

import { Button } from "@narbel/ui/components/button";
import { ModalRoot, overlayClass } from "@narbel/ui/components/modal-motion";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useDragControls } from "motion/react";
import * as React from "react";
import { Dialog as DialogPrimitive, Heading } from "react-aria-components";

type SheetControl = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

const panelBase =
  "bg-popover text-popover-foreground shadow-elevated ring-border z-50 flex flex-col overflow-hidden text-sm ring-1 outline-none";

function Sheet({
  side = "right",
  isOpen,
  onOpenChange,
  onExitComplete,
  className,
  children,
  "aria-label": ariaLabel,
}: SheetControl & { side?: "right" | "left" }) {
  const offscreen =
    side === "right" ? "calc(100% + 10px)" : "calc(-100% - 10px)";
  return (
    <ModalRoot
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onExitComplete={onExitComplete}
      overlaySlot="sheet-overlay"
      panelSlot="sheet-content"
      panelData={{ "data-side": side }}
      overlayClassName={overlayClass}
      hidden={(reduce) =>
        reduce ? { opacity: 0 } : { opacity: 0, x: offscreen }
      }
      panelClassName={cn(
        panelBase,
        "fixed top-2.5 bottom-2.5 w-[min(420px,calc(100vw-20px))] rounded-[20px]",
        side === "right" ? "right-2.5" : "left-2.5",
        className
      )}
    >
      <DialogPrimitive
        data-slot="sheet"
        aria-label={ariaLabel}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        {children}
      </DialogPrimitive>
    </ModalRoot>
  );
}

function Drawer({
  isOpen,
  onOpenChange,
  onExitComplete,
  className,
  children,
  "aria-label": ariaLabel,
}: SheetControl) {
  const controls = useDragControls();
  return (
    <ModalRoot
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onExitComplete={onExitComplete}
      overlaySlot="drawer-overlay"
      panelSlot="drawer-content"
      overlayClassName={overlayClass}
      hidden={(reduce) =>
        reduce ? { opacity: 0 } : { opacity: 0, y: "calc(100% + 8px)" }
      }
      panelClassName={cn(
        panelBase,
        "fixed inset-x-2 bottom-2 max-h-[85svh] rounded-[25px]",
        className
      )}
      panelProps={{
        drag: "y",
        dragListener: false,
        dragControls: controls,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0, bottom: 0.6 },
        dragTransition: { bounceStiffness: 400, bounceDamping: 40 },
        onDragEnd: (_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) {
            onOpenChange(false);
          }
        },
      }}
    >
      <div
        data-slot="drawer-handle"
        aria-hidden
        className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <span className="bg-border-strong h-1 w-9 rounded-full" />
      </div>
      <DialogPrimitive
        data-slot="drawer"
        aria-label={ariaLabel}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        {children}
      </DialogPrimitive>
    </ModalRoot>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex shrink-0 flex-col gap-1 p-6 pr-14 pb-3", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Heading>, "slot">) {
  return (
    <Heading
      slot="title"
      data-slot="sheet-title"
      className={cn("font-display text-headline font-normal", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "slot">) {
  return (
    <div
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-3", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2.5 p-6 pt-3 *:w-full sm:flex-row sm:justify-end sm:*:w-auto",
        className
      )}
      {...props}
    />
  );
}

function SheetClose({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button
      slot="close"
      data-slot="sheet-close"
      variant="ghost"
      size="icon-sm"
      aria-label="Close"
      className={cn("absolute top-4 right-4", className)}
      {...props}
    >
      <XIcon />
    </Button>
  );
}

export {
  Drawer,
  Sheet,
  SheetBody,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
};
