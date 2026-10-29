import { Button } from "@narbel/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@narbel/ui/components/dropdown-menu";
import { SlidersHorizontal } from "lucide-react";

import { PREFERENCE_LABELS } from "../model/use-preferences";
import type { Preferences } from "../model/use-preferences";

const KEYS = Object.keys(PREFERENCE_LABELS) as (keyof Preferences)[];

export const PreferencesMenu = ({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (next: Preferences) => void;
}) => (
  <DropdownMenuTrigger>
    <Button
      variant="ghost"
      size="sm"
      aria-label="Preferences"
      className="max-xl:size-8 max-xl:rounded-[10px] max-xl:px-0"
    >
      <SlidersHorizontal />
      <span className="max-xl:hidden">Preferences</span>
    </Button>
    <DropdownMenu
      placement="bottom end"
      className="min-w-48"
      selectionMode="multiple"
      selectedKeys={KEYS.filter((key) => prefs[key])}
      onSelectionChange={(selection) => {
        const on = new Set(selection === "all" ? KEYS : selection);
        onChange(
          Object.fromEntries(
            KEYS.map((key) => [key, on.has(key)])
          ) as unknown as Preferences
        );
      }}
    >
      {KEYS.map((key) => (
        <DropdownMenuItem key={key} id={key}>
          {PREFERENCE_LABELS[key]}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  </DropdownMenuTrigger>
);
