// Mirrors Excalidraw 0.18's isMobileBreakpoint (MQ_MAX_WIDTH_PORTRAIT 730, MQ_MAX_HEIGHT_LANDSCAPE 500, MQ_MAX_WIDTH_LANDSCAPE 1000).
// Only a first-paint guess: once Excalidraw mounts, its own device state (see DeviceReporter) is the single source of truth.
export const PHONE_QUERY =
  "(max-width: 730px), (max-height: 499px) and (max-width: 999px)";
