"use client";

import { cn } from "cn";
import * as React from "react";
import {
  composeRenderProps,
  Input as InputPrimitive,
} from "react-aria-components";

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<typeof InputPrimitive>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={composeRenderProps(className, (className) =>
        cn(
          "border-input file:text-foreground placeholder:text-subtle-foreground bg-card disabled:bg-muted aria-invalid:outline-destructive focus-visible:outline-ring h-10 w-full min-w-0 rounded-[10px] border px-3.5 py-1 text-sm outline-hidden transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-solid",
          className
        )
      )}
      {...props}
    />
  );
}

export { Input };
