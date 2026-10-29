"use client";

import { Button } from "@narbel/ui/components/button";
import { ModalRoot, overlayClass } from "@narbel/ui/components/modal-motion";
import { XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import * as React from "react";
import { Dialog as DialogPrimitive, Heading } from "react-aria-components";

function DialogClose({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      slot="close"
      data-slot="dialog-close"
      variant={variant}
      size={size}
      className={cn(className)}
      {...props}
    />
  );
}

function Dialog({
  className,
  children,
  isOpen,
  onOpenChange,
  onExitComplete,
  showCloseButton = true,
  isDismissable = true,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
  isDismissable?: boolean;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}) {
  return (
    <ModalRoot
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onExitComplete={onExitComplete}
      isDismissable={isDismissable}
      overlaySlot="dialog-overlay"
      panelSlot="dialog-content"
      overlayClassName={cn(
        overlayClass,
        "flex items-center justify-center p-4"
      )}
      hidden={(reduce) =>
        reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
      }
      panelClassName={cn(
        "bg-popover text-popover-foreground shadow-elevated ring-border relative grid max-h-full w-full max-w-md gap-4 overflow-y-auto rounded-[20px] p-6 text-sm ring-1 outline-none sm:p-7",
        className
      )}
    >
      <DialogPrimitive
        data-slot="dialog"
        className="[display:inherit] [gap:inherit] outline-none"
      >
        {children}
        {showCloseButton && (
          <DialogClose
            variant="ghost"
            className="absolute top-3 right-3 rounded-[10px]"
            size="icon-sm"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </DialogPrimitive>
    </ModalRoot>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2.5 *:w-full sm:flex-row sm:justify-end sm:*:w-auto",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && <DialogClose variant="outline">Close</DialogClose>}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Heading>, "slot">) {
  return (
    <Heading
      slot="title"
      data-slot="dialog-title"
      className={cn("font-display text-headline font-normal", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "slot">) {
  return (
    <div
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
