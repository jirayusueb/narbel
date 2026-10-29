import { Button } from "@narbel/ui/components/button";
import { ModalRoot, overlayClass } from "@narbel/ui/components/modal-motion";
import { cn } from "cn";
import * as React from "react";
import { Dialog as AlertDialogPrimitive, Heading } from "react-aria-components";

function AlertDialog({
  className,
  size = "default",
  children,
  isOpen,
  onOpenChange,
  onExitComplete,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
  className?: string;
  size?: "default" | "sm";
  children: React.ReactNode;
}) {
  return (
    <ModalRoot
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onExitComplete={onExitComplete}
      isDismissable={false}
      overlaySlot="alert-dialog-overlay"
      panelSlot="alert-dialog-content"
      panelData={{ "data-size": size }}
      overlayClassName={cn(
        overlayClass,
        "flex items-center justify-center p-4"
      )}
      hidden={(reduce) =>
        reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
      }
      panelClassName={cn(
        "group/alert-dialog-content bg-popover text-popover-foreground shadow-elevated ring-border relative grid max-h-full w-full gap-4 overflow-y-auto rounded-[20px] p-6 ring-1 outline-none data-[size=sm]:max-w-xs sm:p-7 data-[size=default]:sm:max-w-md",
        className
      )}
    >
      <AlertDialogPrimitive
        data-slot="alert-dialog"
        role="alertdialog"
        className="[display:inherit] [gap:inherit] outline-none"
      >
        {children}
      </AlertDialogPrimitive>
    </ModalRoot>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2.5 *:w-full group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end sm:*:w-auto",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "bg-muted mb-2 inline-flex size-12 items-center justify-center rounded-[15px] sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Heading>, "slot">) {
  return (
    <Heading
      slot="title"
      data-slot="alert-dialog-title"
      className={cn(
        "font-display text-headline font-normal sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "slot">) {
  return (
    <div
      data-slot="alert-dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      slot="close"
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      slot="close"
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      variant={variant}
      size={size}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
};
