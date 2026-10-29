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
        "peer border-input bg-card focus-visible:outline-ring data-focus-visible:outline-ring data-invalid:border-destructive aria-invalid:border-destructive data-selected:border-primary data-selected:bg-primary data-selected:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground grid size-4.5 shrink-0 place-content-center rounded-[5px] border outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-solid",
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
