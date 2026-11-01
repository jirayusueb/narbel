"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@narbel/ui/components/input-group";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import * as React from "react";

function PasswordField({
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  const revealed = visible && !disabled;
  const Icon = revealed ? EyeSlashIcon : EyeIcon;

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        disabled={disabled}
        type={revealed ? "text" : "password"}
      />
      <InputGroupAddon
        align="inline-end"
        className="self-stretch p-0 has-[>button]:mr-0"
      >
        <InputGroupButton
          aria-label={revealed ? "Hide password" : "Show password"}
          isDisabled={disabled}
          onPress={() => setVisible((v) => !v)}
          size="icon-sm"
          className="relative h-full w-10 rounded-s-none rounded-e-md pointer-coarse:w-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1"
        >
          <Icon aria-hidden />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordField };
