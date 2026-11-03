import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@narbel/ui/components/input-group";
import { useEventListener } from "@reactuses/core";
import { Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";
import type { ComponentProps } from "react";

import { TOUCH_ICON } from "./touch";

export const PasswordInput = (
  props: Omit<ComponentProps<typeof InputGroupInput>, "type">
) => {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // password managers offer to save only what they see submitted as a password
  useEventListener(
    "submit",
    () => setVisible(false),
    () => input.current?.form
  );

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        ref={input}
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
