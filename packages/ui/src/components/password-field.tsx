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

  // password managers offer to save only what they see submitted as a password
  React.useEffect(() => {
    if (!revealed) {
      return;
    }
    const hide = () => setVisible(false);
    document.addEventListener("submit", hide, true);
    return () => document.removeEventListener("submit", hide, true);
  }, [revealed]);

  return (
    <InputGroup>
      <InputGroupInput
        // a revealed password is still a password: keep it out of spellcheck services
        spellCheck={false}
        autoCapitalize="none"
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
          // a pointer press keeps the caret in the field; Tab still reaches the button
          preventFocusOnPress
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
