import "./tool-icon.css";

import clsx from "clsx";
import { ToolButton } from "./tool-button";
import { handIcon } from "./icons";
import { KEYS } from "../keys";

type LockIconProps = {
  title?: string;
  name?: string;
  checked: boolean;
  onChange?(): void;
  isMobile?: boolean;
};

export const HandButton = (props: LockIconProps) => {
  return (
    <ToolButton
      className={clsx("Shape", { fillable: false })}
      type="radio"
      icon={handIcon}
      name="editor-current-shape"
      checked={props.checked}
      title={`${props.title} — H`}
      keyBindingLabel={!props.isMobile ? KEYS.H.toLocaleUpperCase() : undefined}
      aria-label={`${props.title} — H`}
      aria-keyshortcuts={KEYS.H}
      data-testid={`toolbar-hand`}
      onChange={() => props.onChange?.()}
    />
  );
};
