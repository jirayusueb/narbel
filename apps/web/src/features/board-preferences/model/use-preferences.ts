import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useState } from "react";

export interface Preferences {
  grid: boolean;
  toolLock: boolean;
  snap: boolean;
  zen: boolean;
  stats: boolean;
}

export const PREFERENCE_LABELS: Record<keyof Preferences, string> = {
  grid: "Grid (snaps to grid)",
  toolLock: "Keep tool active",
  snap: "Snap to objects",
  zen: "Zen mode",
  stats: "Stats",
};

const DEFAULTS: Preferences = {
  grid: false,
  toolLock: false,
  snap: true,
  zen: false,
  stats: false,
};

const storageKey = (userId: string) => `narbel:prefs:${userId}`;

const load = (userId: string): Preferences => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULTS;
  }
};

const IDLE_TOOLS = new Set(["selection", "hand"]);

export const usePreferences = ({
  userId,
  api,
}: {
  userId: string;
  api: ExcalidrawImperativeAPI | null;
}) => {
  const [prefs, setPrefs] = useState(() => load(userId));

  const update = useCallback(
    (next: Preferences) => {
      setPrefs(next);
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    },
    [userId]
  );

  useEffect(() => {
    if (!api) {
      return;
    }
    const { stats } = api.getAppState();
    if (stats.open !== prefs.stats) {
      api.updateScene({
        appState: { stats: { ...stats, open: prefs.stats } } as AppState,
      });
    }
  }, [api, prefs.stats]);

  // shortcut: closing the stats panel with its own X leaves the menu toggle stale.
  // Excalidraw resets the lock whenever a tool is picked, so the preference is re-asserted on change.
  const onAppState = useCallback(
    (appState: AppState) => {
      if (!api) {
        return;
      }
      const { activeTool } = appState;
      if (
        prefs.toolLock &&
        !activeTool.locked &&
        !IDLE_TOOLS.has(activeTool.type)
      ) {
        api.updateScene({
          appState: { activeTool: { ...activeTool, locked: true } } as AppState,
        });
      }
    },
    [api, prefs.toolLock]
  );

  return {
    prefs,
    handleChange: update,
    onAppState,
    excalidrawProps: {
      gridModeEnabled: prefs.grid,
      objectsSnapModeEnabled: prefs.snap,
      zenModeEnabled: prefs.zen,
    },
  };
};
