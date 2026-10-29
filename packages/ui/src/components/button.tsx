"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import {
  Button as ButtonPrimitive,
  Link as LinkPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
  type LinkProps as LinkPrimitiveProps,
} from "react-aria-components";

const buttonVariants = cva(
  "group/button aria-invalid:outline-destructive focus-visible:outline-ring data-focus-visible:outline-ring inline-flex shrink-0 cursor-pointer items-center justify-center font-medium tracking-[-0.01em] whitespace-nowrap outline-hidden select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-40 data-disabled:pointer-events-none data-disabled:opacity-40 data-focus-visible:outline-2 data-focus-visible:outline-offset-3 data-focus-visible:outline-solid [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground ease-intent hover:bg-citrus hover:text-citrus-foreground aria-expanded:bg-citrus aria-expanded:text-citrus-foreground transition-colors duration-500",
        citrus:
          "bg-citrus text-citrus-foreground ease-intent hover:bg-primary hover:text-primary-foreground transition-colors duration-500",
        secondary:
          "bg-secondary text-secondary-foreground shadow-surface ease-intent in-[.bg-card,.bg-popover]:bg-muted hover:bg-citrus hover:text-citrus-foreground aria-expanded:bg-citrus aria-expanded:text-citrus-foreground transition-colors duration-500 in-[.bg-card,.bg-popover]:shadow-none",
        outline:
          "border-border-strong text-foreground hover:bg-accent aria-expanded:bg-accent border bg-transparent transition-colors duration-150",
        ghost:
          "text-foreground hover:bg-accent aria-expanded:bg-accent aria-pressed:bg-accent transition-colors duration-150",
        destructive:
          "bg-destructive/12 text-destructive hover:bg-destructive hover:text-background transition-colors duration-300",
        link: "text-foreground decoration-border-strong hover:decoration-foreground underline underline-offset-4 transition-colors",
      },
      size: {
        default:
          "h-10 gap-2.5 rounded-[15px] px-5 text-sm has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1.5 rounded-[8px] px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-2 rounded-[10px] px-3.5 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-15 gap-4 rounded-[20px] px-7.5 text-sm has-data-[icon=inline-start]:pl-6.5",
        icon: "size-10 rounded-[15px]",
        "icon-xs":
          "size-7 rounded-[8px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-[10px]",
        "icon-lg": "size-15 rounded-[20px]",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto rounded-none px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<ButtonPrimitiveProps, "className"> &
  React.RefAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function LinkButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<LinkPrimitiveProps, "className"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  }) {
  return (
    <LinkPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, LinkButton, buttonVariants };
