import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import {
  Checkbox as CheckboxPrimitive,
  composeRenderProps,
  type CheckboxProps,
} from "react-aria-components";

function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      className={cn(
        "peer border-input group-has-[:focus-visible]/field-label:not-data-checked:border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-focus-visible:border-ring data-focus-visible:ring-ring/50 data-invalid:border-destructive data-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-invalid:border-destructive/50 dark:data-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground data-invalid:data-selected:border-primary dark:data-selected:bg-primary relative flex size-4 shrink-0 items-center justify-center rounded-none border transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-1 aria-invalid:ring-1 data-focus-visible:ring-1 data-invalid:ring-1 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      {composeRenderProps(
        children,
        (children, { isSelected, isIndeterminate }) => (
          <>
            <span
              data-slot="checkbox-indicator"
              className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
            >
              {(isSelected || isIndeterminate) && <CheckIcon />}
            </span>
            {children}
          </>
        )
      )}
    </CheckboxPrimitive>
  );
}

export { Checkbox };
