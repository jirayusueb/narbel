import { MainMenu } from "@excalidraw/excalidraw";
import { Button } from "@narbel/ui/components/button";
import { Check } from "lucide-react";
import { motion } from "motion/react";

import { PREFERENCE_LABELS } from "../model/use-preferences";
import type { Preferences } from "../model/use-preferences";

const KEYS = Object.keys(PREFERENCE_LABELS) as (keyof Preferences)[];

interface PreferencesProps {
  prefs: Preferences;
  onChange: (next: Preferences) => void;
}

// Lives inside Excalidraw's own main menu so every canvas setting sits in one place.
export const PreferencesMenuItems = ({ prefs, onChange }: PreferencesProps) => (
  <MainMenu.Group title="Preferences">
    {KEYS.map((key) => (
      <MainMenu.Item
        key={key}
        aria-pressed={prefs[key]}
        icon={prefs[key] ? <Check /> : <span />}
        onSelect={(event) => {
          // Keep the menu open so several settings can be flipped in a row.
          event.preventDefault();
          onChange({ ...prefs, [key]: !prefs[key] });
        }}
      >
        {PREFERENCE_LABELS[key]}
      </MainMenu.Item>
    ))}
  </MainMenu.Group>
);

export const PreferencesToggles = ({ prefs, onChange }: PreferencesProps) => (
  <ul className="flex flex-col">
    {KEYS.map((key) => (
      <li key={key}>
        <Button
          variant="ghost"
          aria-pressed={prefs[key]}
          className="h-11 w-full justify-between rounded-md px-3 font-normal aria-pressed:bg-transparent"
          onPress={() => onChange({ ...prefs, [key]: !prefs[key] })}
        >
          {PREFERENCE_LABELS[key]}
          <span
            aria-hidden="true"
            className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors duration-200 ${
              prefs[key] ? "bg-primary justify-end" : "bg-muted justify-start"
            }`}
          >
            <motion.span
              layout
              transition={{ duration: 0.2, ease: [0.6, 0, 0.1, 1] }}
              className={`size-5 rounded-full shadow-sm ${
                prefs[key] ? "bg-citrus" : "bg-card"
              }`}
            />
          </span>
        </Button>
      </li>
    ))}
  </ul>
);
