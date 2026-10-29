import { cn } from "cn";
import * as React from "react";
import {
  composeRenderProps,
  TextArea as TextareaPrimitive,
} from "react-aria-components";

function Textarea({
  className,
  ...props
}: React.ComponentProps<typeof TextareaPrimitive>) {
  return (
    <TextareaPrimitive
      data-slot="textarea"
      className={composeRenderProps(className, (className) =>
        cn(
          "border-input placeholder:text-subtle-foreground bg-card disabled:bg-muted aria-invalid:outline-destructive focus-visible:outline-ring flex field-sizing-content min-h-20 w-full rounded-[10px] border px-3.5 py-2.5 text-sm transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:outline-2 aria-invalid:outline-offset-2",
          className
        )
      )}
      {...props}
    />
  );
}

export { Textarea };
