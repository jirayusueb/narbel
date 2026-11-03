import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@narbel/ui/components/input-group";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { ComponentProps } from "react";

import { TOUCH_ICON } from "./touch";

export const PasswordInput = (
  props: Omit<ComponentProps<typeof InputGroupInput>, "type">
) => {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        type={visible ? "text" : "password"}
        // a revealed password is still a password: keep it out of spellcheck services
        spellCheck={false}
        autoCapitalize="none"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          className={TOUCH_ICON}
          aria-label="Show password"
          aria-pressed={visible}
          // a pointer press keeps the caret in the field; Tab still reaches the button
          preventFocusOnPress
          onPress={() => setVisible((shown) => !shown)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
};
