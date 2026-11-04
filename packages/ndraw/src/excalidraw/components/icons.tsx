// The editor's icon set is lucide (the same library the rest of narbel uses),
// re-exported under the historical names so consumers keep their imports.
// Preview glyphs (fill, stroke style and width, sloppiness, edges, arrowheads,
// font sizes, welcome-screen arrows) and brand marks lucide does not ship stay
// hand-drawn below.

import React from "react";
import {
  ALargeSmall,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Angle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ArrowUpToLine,
  Brain,
  BringToFront,
  CaseSensitive,
  Check,
  ChevronsDown,
  ChevronsUp,
  Circle,
  CircleHelp,
  ClipboardList,
  Clock,
  CloudUpload,
  Code,
  CodeXml,
  Coffee,
  Copy,
  CopyPlus,
  CornerUpRight,
  Crop,
  Crosshair,
  Diamond,
  Download,
  Eraser,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  FileUp,
  FlipHorizontal,
  FlipVertical,
  Grid3x3,
  Hand,
  Heading,
  Image,
  ImageDown,
  Library,
  Link,
  Link2,
  LoaderCircle,
  Lock,
  LockOpen,
  Magnet,
  Maximize,
  Menu,
  Mic,
  MicOff,
  Minus,
  Monitor,
  Moon,
  MoreHorizontal,
  MousePointer2,
  MoveRight,
  Octagon,
  PaintBucket,
  Paintbrush,
  Palette,
  Pencil,
  PencilLine,
  Pin,
  Pipette,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  Search,
  SendToBack,
  Shapes,
  Share2,
  Sparkles,
  Spline,
  Square,
  SquareDashed,
  SquareDashedMousePointer,
  Sun,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Upload,
  Users,
  Workflow,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from "lucide-react";

import oc from "open-color";
import clsx from "clsx";
import type { Theme } from "../element/types";
import { THEME } from "../constants";

export const iconFillColor = (theme: Theme) => "var(--icon-fill-color)";

const handlerColor = (theme: Theme) =>
  theme === THEME.LIGHT ? oc.white : "#1e1e1e";

type Opts = {
  width?: number;
  height?: number;
  mirror?: true;
} & React.SVGProps<SVGSVGElement>;

export const createIcon = (
  d: string | React.ReactNode,
  opts: number | Opts = 512,
) => {
  const {
    width = 512,
    height = width,
    mirror,
    style,
    ...rest
  } = typeof opts === "number" ? ({ width: opts } as Opts) : opts;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      className={clsx({ "rtl-mirror": mirror })}
      style={style}
      {...rest}
    >
      {typeof d === "string" ? <path fill="currentColor" d={d} /> : d}
    </svg>
  );
};

const tablerIconProps: Opts = {
  width: 24,
  height: 24,
  fill: "none",
  strokeWidth: 2,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const modifiedTablerIconProps: Opts = {
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// -----------------------------------------------------------------------------

// tabler-icons: present
export const PlusPromoIcon = createIcon(
  <g strokeWidth="1.5">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <rect x={3} y={8} width={18} height={4} rx={1} />
    <line x1={12} y1={8} x2={12} y2={21} />
    <path d="M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5" />
  </g>,
  tablerIconProps,
);

// tabler-icons: book
export const LibraryIcon = <Library />;

export const PlusIcon = <Plus />;

export const DotsIcon = <MoreHorizontal />;

export const PinIcon = <Pin />;

export const UnlockedIcon = <LockOpen />;

export const LockedIcon = <Lock />;

export const WelcomeScreenMenuArrow = createIcon(
  <>
    <path
      d="M38.5 83.5c-14-2-17.833-10.473-21-22.5C14.333 48.984 12 22 12 12.5"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="m12.005 10.478 7.905 14.423L6 25.75l6.005-15.273Z"
      fill="currentColor"
    />
    <path
      d="M12.005 10.478c1.92 3.495 3.838 7 7.905 14.423m-7.905-14.423c3.11 5.683 6.23 11.368 7.905 14.423m0 0c-3.68.226-7.35.455-13.91.85m13.91-.85c-5.279.33-10.566.647-13.91.85m0 0c1.936-4.931 3.882-9.86 6.005-15.273M6 25.75c2.069-5.257 4.135-10.505 6.005-15.272"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </>,
  { width: 41, height: 94, fill: "none" },
);

// custom
export const WelcomeScreenHelpArrow = createIcon(
  <>
    <path
      d="M18.026 1.232c-5.268 13.125-5.548 33.555 3.285 42.311 8.823 8.75 33.31 12.304 42.422 13.523"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="m72.181 59.247-13.058-10-2.948 13.62 16.006-3.62Z"
      fill="currentColor"
    />
    <path
      d="M72.181 59.247c-3.163-2.429-6.337-4.856-13.058-10m13.058 10c-5.145-3.936-10.292-7.882-13.058-10m0 0c-.78 3.603-1.563 7.196-2.948 13.62m2.948-13.62c-1.126 5.168-2.24 10.346-2.948 13.62m0 0c5.168-1.166 10.334-2.343 16.006-3.62m-16.006 3.62c5.51-1.248 11.01-2.495 16.006-3.62"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </>,
  { width: 85, height: 71, fill: "none" },
);

// custom
export const WelcomeScreenTopToolbarArrow = createIcon(
  <>
    <path
      d="M1 77c14-2 31.833-11.973 35-24 3.167-12.016-6-35-9.5-43.5"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="m24.165 1.093-2.132 16.309 13.27-4.258-11.138-12.05Z"
      fill="currentColor"
    />
    <path
      d="M24.165 1.093c-.522 3.953-1.037 7.916-2.132 16.309m2.131-16.309c-.835 6.424-1.68 12.854-2.13 16.308m0 0c3.51-1.125 7.013-2.243 13.27-4.257m-13.27 4.257c5.038-1.608 10.08-3.232 13.27-4.257m0 0c-3.595-3.892-7.197-7.777-11.14-12.05m11.14 12.05c-3.837-4.148-7.667-8.287-11.14-12.05"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </>,
  { width: 38, height: 78, fill: "none" },
);

// custom
export const ExcalLogo = createIcon(
  <g fill="currentColor">
    <path
      d="M39.9 32.889a.326.326 0 0 0-.279-.056c-2.094-3.083-4.774-6-7.343-8.833l-.419-.472a.212.212 0 0 0-.056-.139.586.586 0 0 0-.167-.111l-.084-.083-.056-.056c-.084-.167-.28-.278-.475-.167-.782.39-1.507.973-2.206 1.528-.92.722-1.842 1.445-2.708 2.25a8.405 8.405 0 0 0-.977 1.028c-.14.194-.028.361.14.444-.615.611-1.23 1.223-1.843 1.861a.315.315 0 0 0-.084.223c0 .083.056.166.111.194l1.09.833v.028c1.535 1.528 4.244 3.611 7.12 5.861.418.334.865.667 1.284 1 .195.223.39.473.558.695.084.11.28.139.391.055.056.056.14.111.196.167a.398.398 0 0 0 .167.056.255.255 0 0 0 .224-.111.394.394 0 0 0 .055-.167c.029 0 .028.028.056.028a.318.318 0 0 0 .224-.084l5.082-5.528a.309.309 0 0 0 0-.444Zm-14.63-1.917a.485.485 0 0 0 .111.14c.586.5 1.2 1 1.843 1.555l-2.569-1.945-.251-.166c-.056-.028-.112-.084-.168-.111l-.195-.167.056-.056.055-.055.112-.111c.866-.861 2.346-2.306 3.1-3.028-.81.805-2.43 3.167-2.095 3.944Zm8.767 6.89-2.122-1.612a44.713 44.713 0 0 0-2.625-2.5c1.145.861 2.122 1.611 2.262 1.75 1.117.972 1.06.806 1.815 1.445l.921.666a1.06 1.06 0 0 1-.251.25Zm.558.416-.056-.028c.084-.055.168-.111.252-.194l-.196.222ZM1.089 5.75c.055.361.14.722.195 1.056.335 1.833.67 3.5 1.284 4.75l.252.944c.084.361.223.806.363.917 1.424 1.25 3.602 3.11 5.947 4.889a.295.295 0 0 0 .363 0s0 .027.028.027a.254.254 0 0 0 .196.084.318.318 0 0 0 .223-.084c2.988-3.305 5.221-6.027 6.813-8.305.112-.111.14-.278.14-.417.111-.111.195-.25.307-.333.111-.111.111-.306 0-.39l-.028-.027c0-.055-.028-.139-.084-.167-.698-.666-1.2-1.138-1.731-1.638-.922-.862-1.871-1.75-3.881-3.75l-.028-.028c-.028-.028-.056-.056-.112-.056-.558-.194-1.703-.389-3.127-.639C6.087 2.223 3.21 1.723.614.944c0 0-.168 0-.196.028l-.083.084c-.028.027-.056.055-.224.11h.056-.056c.028.167.028.278.084.473 0 .055.112.5.112.555l.782 3.556Zm15.496 3.278-.335-.334c.084.112.196.195.335.334Zm-3.546 4.666-.056.056c0-.028.028-.056.056-.056Zm-2.038-10c.168.167.866.834 1.033.973-.726-.334-2.54-1.167-3.379-1.445.838.167 1.983.334 2.346.472ZM1.424 2.306c.419.722.754 3.222 1.089 5.666-.196-.778-.335-1.555-.503-2.278-.251-1.277-.503-2.416-.838-3.416.056 0 .14 0 .252.028Zm-.168-.584c-.112 0-.223-.028-.307-.028 0-.027 0-.055-.028-.055.14 0 .223.028.335.083Zm-1.089.222c0-.027 0-.027 0 0ZM39.453 1.333c.028-.11-.558-.61-.363-.639.42-.027.42-.666 0-.666-.558.028-1.144.166-1.675.25-.977.194-1.982.389-2.96.61-2.205.473-4.383.973-6.561 1.557-.67.194-1.424.333-2.066.666-.224.111-.196.333-.084.472-.056.028-.084.028-.14.056-.195.028-.363.056-.558.083-.168.028-.252.167-.224.334 0 .027.028.083.028.11-1.173 1.556-2.485 3.195-3.909 4.945-1.396 1.611-2.876 3.306-4.356 5.056-4.719 5.5-10.052 11.75-15.943 17.25a.268.268 0 0 0 0 .389c.028.027.056.055.084.055-.084.084-.168.14-.252.222-.056.056-.084.111-.084.167a.605.605 0 0 0-.111.139c-.112.111-.112.305.028.389.111.11.307.11.39-.028.029-.028.029-.056.056-.056a.44.44 0 0 1 .615 0c.335.362.67.723.977 1.028l-.698-.583c-.112-.111-.307-.083-.39.028-.113.11-.085.305.027.389l7.427 6.194c.056.056.112.056.196.056s.14-.028.195-.084l.168-.166c.028.027.083.027.111.027.084 0 .14-.027.196-.083 10.052-10.055 18.15-17.639 27.42-24.417.083-.055.111-.166.111-.25.112 0 .196-.083.251-.194 1.704-5.194 2.039-9.806 2.15-12.083v-.028c0-.028.028-.056.028-.083.028-.056.028-.084.028-.084a1.626 1.626 0 0 0-.111-1.028ZM21.472 9.5c.446-.5.893-1.028 1.34-1.5-2.876 3.778-7.65 9.583-14.408 16.5 4.607-5.083 9.242-10.333 13.068-15ZM5.193 35.778h.084-.084Zm3.462 3.194c-.027-.028-.027-.028 0-.028v.028Zm4.16-3.583c.224-.25.448-.472.699-.722 0 0 0 .027.028.027-.252.223-.475.445-.726.695Zm1.146-1.111c.14-.14.279-.334.446-.5l.028-.028c1.648-1.694 3.351-3.389 5.082-5.111l.028-.028c.419-.333.921-.694 1.368-1.028a379.003 379.003 0 0 0-6.952 6.695ZM24.794 6.472c-.921 1.195-1.954 2.778-2.82 4.028-2.736 3.944-11.532 13.583-11.727 13.75a1976.983 1976.983 0 0 1-8.042 7.639l-.167.167c-.14-.167-.14-.417.028-.556C14.49 19.861 22.03 10.167 25.074 5.917c-.084.194-.14.36-.28.555Zm4.83 5.695c-1.116-.64-1.646-1.64-1.34-2.611l.084-.334c.028-.083.084-.194.14-.277.307-.5.754-.917 1.257-1.167.027 0 .055 0 .083-.028-.028-.056-.028-.139-.028-.222.028-.167.14-.278.335-.278.335 0 1.369.306 1.76.639.111.083.223.194.335.305.14.167.363.445.474.667.056.028.112.306.196.445.056.222.111.472.084.694-.028.028 0 .194-.028.194a2.668 2.668 0 0 1-.363 1.028c-.028.028-.028.056-.056.084l-.028.027c-.14.223-.335.417-.53.556-.643.444-1.369.583-2.095.389 0 0-.195-.084-.28-.111Zm8.154-.834a39.098 39.098 0 0 1-.893 3.167c0 .028-.028.083 0 .111-.056 0-.084.028-.14.056-2.206 1.61-4.356 3.305-6.506 5.028 1.843-1.64 3.686-3.306 5.613-4.945.558-.5.949-1.139 1.06-1.861l.28-1.667v-.055c.14-.334.67-.195.586.166Z"
      fill="currentColor"
    />
  </g>,
  { width: 40, height: 40, fill: "none" },
);

// custom
export const SelectionIcon = <MousePointer2 />;

export const RectangleIcon = <Square />;

export const DiamondIcon = <Diamond />;

export const EllipseIcon = <Circle />;

export const ArrowIcon = <ArrowUpRight />;

export const LineIcon = <Minus />;

export const PenModeIcon = <PencilLine />;

export const FreedrawIcon = <Pencil />;

export const TextIcon = <Type />;

export const ImageIcon = <Image />;

export const EraserIcon = <Eraser />;

export const ZoomInIcon = <ZoomIn />;

export const ZoomOutIcon = <ZoomOut />;

export const ZoomResetIcon = <Expand />;

export const TrashIcon = <Trash2 />;

export const EmbedIcon = <CodeXml />;

export const DuplicateIcon = <CopyPlus />;

export const MoonIcon = <Moon />;

export const SunIcon = <Sun />;

export const HamburgerMenuIcon = <Menu />;

export const ExportIcon = <Upload />;

export const HelpIcon = <CircleHelp />;

export const HelpIconThin = <CircleHelp />;

export const ExternalLinkIcon = <ExternalLink />;

export const GithubIcon = createIcon(
  <path
    d="M7.5 15.833c-3.583 1.167-3.583-2.083-5-2.5m10 4.167v-2.917c0-.833.083-1.166-.417-1.666 2.334-.25 4.584-1.167 4.584-5a3.833 3.833 0 0 0-1.084-2.667 3.5 3.5 0 0 0-.083-2.667s-.917-.25-2.917 1.084a10.25 10.25 0 0 0-5.166 0C5.417 2.333 4.5 2.583 4.5 2.583a3.5 3.5 0 0 0-.083 2.667 3.833 3.833 0 0 0-1.084 2.667c0 3.833 2.25 4.75 4.584 5-.5.5-.5 1-.417 1.666V17.5"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
);

export const DiscordIcon = createIcon(
  <g strokeWidth="1.25">
    <path d="M7.5 10.833a.833.833 0 1 0 0-1.666.833.833 0 0 0 0 1.666ZM12.5 10.833a.833.833 0 1 0 0-1.666.833.833 0 0 0 0 1.666ZM6.25 6.25c2.917-.833 4.583-.833 7.5 0M5.833 13.75c2.917.833 5.417.833 8.334 0" />
    <path d="M12.917 14.167c0 .833 1.25 2.5 1.666 2.5 1.25 0 2.361-1.39 2.917-2.5.556-1.39.417-4.861-1.25-9.584-1.214-.846-2.5-1.116-3.75-1.25l-.833 2.084M7.083 14.167c0 .833-1.13 2.5-1.526 2.5-1.191 0-2.249-1.39-2.778-2.5-.529-1.39-.397-4.861 1.19-9.584 1.157-.846 2.318-1.116 3.531-1.25l.833 2.084" />
  </g>,
  modifiedTablerIconProps,
);

export const XBrandIcon = createIcon(
  <g strokeWidth="1.25">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
    <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
  </g>,
  tablerIconProps,
);

export const checkIcon = <Check />;

export const LinkIcon = <Link />;

export const save = <Save />;

export const saveAs = <Save />;

export const LoadIcon = <LoaderCircle className="animate-spin" />;

export const clipboard = <ClipboardList />;

export const palette = <Palette />;

export const bucketFillIcon = <PaintBucket />;

export const ExportImageIcon = <ImageDown />;

export const exportToFileIcon = <FileUp />;

export const zoomIn = <ZoomIn />;

export const zoomOut = <ZoomOut />;

export const done = <Check />;

export const menu = <Menu />;

export const UndoIcon = <Undo2 />;

export const RedoIcon = <Redo2 />;

export const questionCircle = <CircleHelp />;

export const share = <Share2 />;

export const warning = <TriangleAlert />;

export const shareIOS = createIcon(
  "M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z",
  { width: 24, height: 24 },
);

export const exportToPlus = createIcon(
  <g strokeWidth={1.25}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M8 9h-1a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-8a2 2 0 0 0 -2 -2h-1" />
    <path d="M12 14v-11" />
    <path d="M9 6l3 -3l3 3" />
  </g>,
  tablerIconProps,
);

export const shareWindows = createIcon(
  <>
    <path
      fill="currentColor"
      d="M40 5.6v6.1l-4.1.7c-8.9 1.4-16.5 6.9-20.6 15C13 32 10.9 43 12.4 43c.4 0 2.4-1.3 4.4-3 5-3.9 12.1-7 18.2-7.7l5-.6v12.8l11.2-11.3L62.5 22 51.2 10.8 40-.5v6.1zm10.2 22.6L44 34.5v-6.8l-6.9.6c-3.9.3-9.8 1.7-13.2 3.1-3.5 1.4-6.5 2.4-6.7 2.2-.9-1 3-7.5 6.4-10.8C28 18.6 34.4 16 40.1 16c3.7 0 3.9-.1 3.9-3.2V9.5l6.2 6.3 6.3 6.2-6.3 6.2z"
    />
    <path
      stroke="currentColor"
      fill="currentColor"
      d="M0 36v20h48v-6.2c0-6 0-6.1-2-4.3-1.1 1-2 2.9-2 4.2V52H4V34c0-17.3-.1-18-2-18s-2 .7-2 20z"
    />
  </>,
  { width: 64, height: 64 },
);

// Icon imported form Storybook
// Storybook is licensed under MIT https://github.com/storybookjs/storybook/blob/next/LICENSE
export const resetZoom = <Expand />;

export const BringForwardIcon = <ArrowUpToLine />;

export const SendBackwardIcon = <ArrowDownToLine />;

export const BringToFrontIcon = <BringToFront />;

export const SendToBackIcon = <SendToBack />;

export const AlignTopIcon = <AlignStartVertical />;

export const AlignBottomIcon = <AlignEndVertical />;

export const AlignLeftIcon = <AlignStartHorizontal />;

export const AlignRightIcon = <AlignEndHorizontal />;

export const DistributeHorizontallyIcon = <AlignHorizontalSpaceAround />;

export const DistributeVerticallyIcon = <AlignVerticalSpaceAround />;

export const CenterVerticallyIcon = <AlignCenterVertical />;

export const CenterHorizontallyIcon = <AlignCenterHorizontal />;

export const usersIcon = <Users />;

export const start = <Play />;

export const stop = <Octagon />;

export const CloseIcon = <X />;

export const clone = <Copy />;

export const shield = createIcon(
  "M11.553 22.894a.998.998 0 00.894 0s3.037-1.516 5.465-4.097C19.616 16.987 21 14.663 21 12V5a1 1 0 00-.649-.936l-8-3a.998.998 0 00-.702 0l-8 3A1 1 0 003 5v7c0 2.663 1.384 4.987 3.088 6.797 2.428 2.581 5.465 4.097 5.465 4.097zm-1.303-8.481l6.644-6.644a.856.856 0 111.212 1.212l-7.25 7.25a.856.856 0 01-1.212 0l-3.75-3.75a.856.856 0 111.212-1.212l3.144 3.144z",
  { width: 24 },
);

export const file = <FileText />;

export const GroupIcon = React.memo(({ theme }: { theme: Theme }) =>
  createIcon(
    <>
      <path d="M25 26H111V111H25" fill={iconFillColor(theme)} />
      <path
        d="M25 111C25 80.2068 25 49.4135 25 26M25 26C48.6174 26 72.2348 26 111 26H25ZM25 26C53.3671 26 81.7343 26 111 26H25ZM111 26C111 52.303 111 78.606 111 111V26ZM111 26C111 51.2947 111 76.5893 111 111V26ZM111 111C87.0792 111 63.1585 111 25 111H111ZM111 111C87.4646 111 63.9293 111 25 111H111ZM25 111C25 81.1514 25 51.3028 25 26V111Z"
        stroke={iconFillColor(theme)}
        strokeWidth="2"
      />
      <path d="M100 100H160V160H100" fill={iconFillColor(theme)} />
      <path
        d="M100 160C100 144.106 100 128.211 100 100M100 100C117.706 100 135.412 100 160 100H100ZM100 100C114.214 100 128.428 100 160 100H100ZM160 100C160 120.184 160 140.369 160 160V100ZM160 100C160 113.219 160 126.437 160 160V100ZM160 160C145.534 160 131.068 160 100 160H160ZM160 160C143.467 160 126.934 160 100 160H160ZM100 160C100 143.661 100 127.321 100 100V160Z"
        stroke={iconFillColor(theme)}
        strokeWidth="2"
      />
      <g
        fill={handlerColor(theme)}
        stroke={iconFillColor(theme)}
        strokeWidth="6"
      >
        <rect x="2.5" y="2.5" width="30" height="30" />
        <rect x="2.5" y="149.5" width="30" height="30" />
        <rect x="147.5" y="149.5" width="30" height="30" />
        <rect x="147.5" y="2.5" width="30" height="30" />
      </g>
    </>,
    { width: 182, height: 182, mirror: true },
  ),
);

export const UngroupIcon = React.memo(({ theme }: { theme: Theme }) =>
  createIcon(
    <>
      <path d="M25 26H111V111H25" fill={iconFillColor(theme)} />
      <path
        d="M25 111C25 80.2068 25 49.4135 25 26M25 26C48.6174 26 72.2348 26 111 26H25ZM25 26C53.3671 26 81.7343 26 111 26H25ZM111 26C111 52.303 111 78.606 111 111V26ZM111 26C111 51.2947 111 76.5893 111 111V26ZM111 111C87.0792 111 63.1585 111 25 111H111ZM111 111C87.4646 111 63.9293 111 25 111H111ZM25 111C25 81.1514 25 51.3028 25 26V111Z"
        stroke={iconFillColor(theme)}
        strokeWidth="2"
      />
      <path d="M100 100H160V160H100" fill={iconFillColor(theme)} />
      <path
        d="M100 160C100 144.106 100 128.211 100 100M100 100C117.706 100 135.412 100 160 100H100ZM100 100C114.214 100 128.428 100 160 100H100ZM160 100C160 120.184 160 140.369 160 160V100ZM160 100C160 113.219 160 126.437 160 160V100ZM160 160C145.534 160 131.068 160 100 160H160ZM160 160C143.467 160 126.934 160 100 160H160ZM100 160C100 143.661 100 127.321 100 100V160Z"
        stroke={iconFillColor(theme)}
        strokeWidth="2"
      />
      <g
        fill={handlerColor(theme)}
        stroke={iconFillColor(theme)}
        strokeWidth="6"
      >
        <rect x="2.5" y="2.5" width="30" height="30" />
        <rect x="78.5" y="149.5" width="30" height="30" />
        <rect x="147.5" y="149.5" width="30" height="30" />
        <rect x="147.5" y="78.5" width="30" height="30" />
        <rect x="105.5" y="2.5" width="30" height="30" />
        <rect x="2.5" y="102.5" width="30" height="30" />
      </g>
    </>,
    { width: 182, height: 182, mirror: true },
  ),
);

export const FillZigZagIcon = createIcon(
  <g strokeWidth={1.25}>
    <path d="M5.879 2.625h8.242a3.27 3.27 0 0 1 3.254 3.254v8.242a3.27 3.27 0 0 1-3.254 3.254H5.88a3.27 3.27 0 0 1-3.254-3.254V5.88A3.27 3.27 0 0 1 5.88 2.626l-.001-.001ZM4.518 16.118l7.608-12.83m.198 13.934 5.051-9.897M2.778 9.675l9.348-6.387m-7.608 12.83 12.857-8.793" />
  </g>,
  modifiedTablerIconProps,
);

export const FillHachureIcon = createIcon(
  <>
    <path
      d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
      stroke="currentColor"
      strokeWidth="1.25"
    />
    <mask
      id="FillHachureIcon"
      style={{ maskType: "alpha" }}
      maskUnits="userSpaceOnUse"
      x={2}
      y={2}
      width={16}
      height={16}
    >
      <path
        d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </mask>
    <g mask="url(#FillHachureIcon)">
      <path
        d="M2.258 15.156 15.156 2.258M7.324 20.222 20.222 7.325m-20.444 5.35L12.675-.222m-8.157 18.34L17.416 5.22"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </>,
  modifiedTablerIconProps,
);

export const FillCrossHatchIcon = createIcon(
  <>
    <g clipPath="url(#a)">
      <path
        d="M5.879 2.625h8.242a3.254 3.254 0 0 1 3.254 3.254v8.242a3.254 3.254 0 0 1-3.254 3.254H5.88a3.254 3.254 0 0 1-3.254-3.254V5.88a3.254 3.254 0 0 1 3.254-3.254Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <mask
        id="FillCrossHatchIcon"
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x={-1}
        y={-1}
        width={22}
        height={22}
      >
        <path
          d="M2.426 15.044 15.044 2.426M7.383 20 20 7.383M0 12.617 12.617 0m-7.98 17.941L17.256 5.324m-2.211 12.25L2.426 4.956M20 12.617 7.383 0m5.234 20L0 7.383m17.941 7.98L5.324 2.745"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <g mask="url(#FillCrossHatchIcon)">
        <path
          d="M14.121 2H5.88A3.879 3.879 0 0 0 2 5.879v8.242A3.879 3.879 0 0 0 5.879 18h8.242A3.879 3.879 0 0 0 18 14.121V5.88A3.879 3.879 0 0 0 14.121 2Z"
          fill="currentColor"
        />
      </g>
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
);

export const FillSolidIcon = createIcon(
  <>
    <g clipPath="url(#a)">
      <path
        d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  { ...modifiedTablerIconProps, fill: "currentColor" },
);

export const StrokeWidthBaseIcon = createIcon(
  <>
    <path
      d="M4.167 10h11.666"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>,
  modifiedTablerIconProps,
);

export const StrokeWidthBoldIcon = createIcon(
  <path
    d="M5 10h10"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  modifiedTablerIconProps,
);

export const StrokeWidthExtraBoldIcon = createIcon(
  <path
    d="M5 10h10"
    stroke="currentColor"
    strokeWidth="3.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  modifiedTablerIconProps,
);

export const StrokeStyleSolidIcon = React.memo(({ theme }: { theme: Theme }) =>
  createIcon(
    <path
      d="M6 10H34"
      stroke={iconFillColor(theme)}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    />,
    {
      width: 40,
      height: 20,
    },
  ),
);

export const StrokeStyleDashedIcon = createIcon(
  <g strokeWidth="2">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 12h2" />
    <path d="M17 12h2" />
    <path d="M11 12h2" />
  </g>,
  tablerIconProps,
);

// tabler-icons: line-dotted
export const StrokeStyleDottedIcon = createIcon(
  <g strokeWidth="2">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 12v.01" />
    <path d="M8 12v.01" />
    <path d="M12 12v.01" />
    <path d="M16 12v.01" />
    <path d="M20 12v.01" />
  </g>,
  tablerIconProps,
);

export const SloppinessArchitectIcon = createIcon(
  <path
    d="M2.5 12.038c1.655-.885 5.9-3.292 8.568-4.354 2.668-1.063.101 2.821 1.32 3.104 1.218.283 5.112-1.814 5.112-1.814"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
);

export const SloppinessArtistIcon = createIcon(
  <path
    d="M2.5 12.563c1.655-.886 5.9-3.293 8.568-4.355 2.668-1.062.101 2.822 1.32 3.105 1.218.283 5.112-1.814 5.112-1.814m-13.469 2.23c2.963-1.586 6.13-5.62 7.468-4.998 1.338.623-1.153 4.11-.132 5.595 1.02 1.487 6.133-1.43 6.133-1.43"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
);

export const SloppinessCartoonistIcon = createIcon(
  <path
    d="M2.5 11.936c1.737-.879 8.627-5.346 10.42-5.268 1.795.078-.418 5.138.345 5.736.763.598 3.53-1.789 4.235-2.147M2.929 9.788c1.164-.519 5.47-3.28 6.987-3.114 1.519.165 1 3.827 2.121 4.109 1.122.281 3.839-2.016 4.606-2.42"
    strokeWidth="1.25"
  />,
  modifiedTablerIconProps,
);

export const EdgeSharpIcon = createIcon(
  <svg strokeWidth="1.5">
    <path d="M3.33334 9.99998V6.66665C3.33334 6.04326 3.33403 4.9332 3.33539 3.33646C4.95233 3.33436 6.06276 3.33331 6.66668 3.33331H10" />
    <path d="M13.3333 3.33331V3.34331" />
    <path d="M16.6667 3.33331V3.34331" />
    <path d="M16.6667 6.66669V6.67669" />
    <path d="M16.6667 10V10.01" />
    <path d="M3.33334 13.3333V13.3433" />
    <path d="M16.6667 13.3333V13.3433" />
    <path d="M3.33334 16.6667V16.6767" />
    <path d="M6.66666 16.6667V16.6767" />
    <path d="M10 16.6667V16.6767" />
    <path d="M13.3333 16.6667V16.6767" />
    <path d="M16.6667 16.6667V16.6767" />
  </svg>,
  modifiedTablerIconProps,
);

// tabler-icons: border-radius
export const EdgeRoundIcon = createIcon(
  <g
    strokeWidth="1.5"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 12v-4a4 4 0 0 1 4 -4h4" />
    <line x1="16" y1="4" x2="16" y2="4.01" />
    <line x1="20" y1="4" x2="20" y2="4.01" />
    <line x1="20" y1="8" x2="20" y2="8.01" />
    <line x1="20" y1="12" x2="20" y2="12.01" />
    <line x1="4" y1="16" x2="4" y2="16.01" />
    <line x1="20" y1="16" x2="20" y2="16.01" />
    <line x1="4" y1="20" x2="4" y2="20.01" />
    <line x1="8" y1="20" x2="8" y2="20.01" />
    <line x1="12" y1="20" x2="12" y2="20.01" />
    <line x1="16" y1="20" x2="16" y2="20.01" />
    <line x1="20" y1="20" x2="20" y2="20.01" />
  </g>,
  tablerIconProps,
);

export const ArrowheadNoneIcon = createIcon(
  <g stroke="currentColor" opacity={0.3} strokeWidth={2}>
    <path d="M12 12l9 0" />
    <path d="M3 9l6 6" />
    <path d="M3 15l6 -6" />
  </g>,
  tablerIconProps,
);

export const ArrowheadArrowIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
      >
        <path d="M34 10H6M34 10L27 5M34 10L27 15" />
        <path d="M27.5 5L34.5 10L27.5 15" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadCircleIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="currentColor"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
      >
        <path d="M32 10L6 10" strokeWidth={2} />
        <circle r="4" transform="matrix(-1 0 0 1 30 10)" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadCircleOutlineIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
        strokeWidth={2}
      >
        <path d="M26 10L6 10" />
        <circle r="4" transform="matrix(-1 0 0 1 30 10)" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadBarIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}>
        <path
          d="M34 10H5.99996M34 10L34 5M34 10L34 15"
          stroke="currentColor"
          strokeWidth={2}
          fill="none"
        />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadTriangleIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="currentColor"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
      >
        <path d="M32 10L6 10" strokeWidth={2} />
        <path d="M27.5 5.5L34.5 10L27.5 14.5L27.5 5.5" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadTriangleOutlineIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
        strokeWidth={2}
        strokeLinejoin="round"
      >
        <path d="M6,9.5H27" />
        <path d="M27,5L34,10L27,14Z" fill="none" />
      </g>,

      { width: 40, height: 20 },
    ),
);

export const ArrowheadDiamondIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="currentColor"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
        strokeLinejoin="round"
        strokeWidth={2}
      >
        <path d="M6,9.5H20" />
        <path d="M27,5L34,10L27,14L20,9.5Z" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadDiamondOutlineIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "translate(40, 0) scale(-1, 1)" : ""}
        strokeLinejoin="round"
        strokeWidth={2}
      >
        <path d="M6,9.5H20" />
        <path d="M27,5L34,10L27,14L20,9.5Z" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadCrowfootIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "" : "translate(40, 0) scale(-1, 1)"}
        strokeLinejoin="round"
        strokeWidth={2}
      >
        <path d="M34,10 H6 M15,10 L7,5 M15,10 L7,15" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadCrowfootOneIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "" : "translate(40, 0) scale(-1, 1)"}
        strokeLinejoin="round"
        strokeWidth={2}
      >
        <path d="M34,10 H6 M15,10 L15,15 L15,5" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const ArrowheadCrowfootOneOrManyIcon = React.memo(
  ({ flip = false }: { flip?: boolean }) =>
    createIcon(
      <g
        stroke="currentColor"
        fill="none"
        transform={flip ? "" : "translate(40, 0) scale(-1, 1)"}
        strokeLinejoin="round"
        strokeWidth={2}
      >
        <path d="M34,10 H6 M15,10 L15,16 L15,4 M15,10 L7,5 M15,10 L7,15" />
      </g>,
      { width: 40, height: 20 },
    ),
);

export const FontSizeSmallIcon = createIcon(
  <>
    <g clipPath="url(#a)">
      <path
        d="M14.167 6.667a3.333 3.333 0 0 0-3.334-3.334H9.167a3.333 3.333 0 0 0 0 6.667h1.666a3.333 3.333 0 0 1 0 6.667H9.167a3.333 3.333 0 0 1-3.334-3.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
);

export const FontSizeMediumIcon = createIcon(
  <>
    <g clipPath="url(#a)">
      <path
        d="M5 16.667V3.333L10 15l5-11.667v13.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
);

export const FontSizeLargeIcon = createIcon(
  <>
    <g clipPath="url(#a)">
      <path
        d="M5.833 3.333v13.334h8.334"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="a">
        <path fill="#fff" d="M0 0h20v20H0z" />
      </clipPath>
    </defs>
  </>,
  modifiedTablerIconProps,
);

export const FontSizeExtraLargeIcon = createIcon(
  <>
    <path
      d="m1.667 3.333 6.666 13.334M8.333 3.333 1.667 16.667M11.667 3.333v13.334h6.666"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>,
  modifiedTablerIconProps,
);

export const fontSizeIcon = <ALargeSmall />;

export const FontFamilyHeadingIcon = <Heading />;

export const FontFamilyNormalIcon = <CaseSensitive />;

export const FontFamilyCodeIcon = <Code />;

export const TextAlignLeftIcon = <AlignStartVertical />;

export const TextAlignCenterIcon = <AlignCenterVertical />;

export const TextAlignRightIcon = <AlignEndVertical />;

export const TextAlignTopIcon = React.memo(({ theme: _theme }: { theme: Theme }) => (
  <AlignStartHorizontal />
));
TextAlignTopIcon.displayName = "TextAlignTopIcon";

export const TextAlignBottomIcon = React.memo(({ theme: _theme }: { theme: Theme }) => (
  <AlignEndHorizontal />
));
TextAlignBottomIcon.displayName = "TextAlignBottomIcon";

export const TextAlignMiddleIcon = React.memo(({ theme: _theme }: { theme: Theme }) => (
  <AlignCenterHorizontal />
));
TextAlignMiddleIcon.displayName = "TextAlignMiddleIcon";

export const angleIcon = <Angle />;

export const publishIcon = <CloudUpload />;

export const eraser = <Eraser />;

export const handIcon = <Hand />;

export const downloadIcon = <Download />;

export const copyIcon = <Copy />;

export const cutIcon = <Scissors />;

export const helpIcon = <CircleHelp />;

export const playerPlayIcon = createIcon(
  <>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
    <path d="M7 4v16l13 -8z"></path>
  </>,
  tablerIconProps,
);

export const playerStopFilledIcon = createIcon(
  <>
    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
    <path
      d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z"
      strokeWidth="0"
      fill="currentColor"
    ></path>
  </>,
  tablerIconProps,
);

export const tablerCheckIcon = <Check />;

export const alertTriangleIcon = <TriangleAlert />;

export const eyeDropperIcon = <Pipette />;

export const extraToolsIcon = <Shapes />;

export const frameToolIcon = <SquareDashed />;

export const mermaidLogoIcon = <Workflow />;

export const ArrowRightIcon = <ArrowRight />;

export const laserPointerToolIcon = <Crosshair />;

export const MagicIcon = <Sparkles />;

export const MagicIconThin = <Sparkles strokeWidth={1} />;

export const OpenAIIcon = createIcon(
  <g stroke="currentColor" fill="none">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M11.217 19.384a3.501 3.501 0 0 0 6.783 -1.217v-5.167l-6 -3.35" />
    <path d="M5.214 15.014a3.501 3.501 0 0 0 4.446 5.266l4.34 -2.534v-6.946" />
    <path d="M6 7.63c-1.391 -.236 -2.787 .395 -3.534 1.689a3.474 3.474 0 0 0 1.271 4.745l4.263 2.514l6 -3.348" />
    <path d="M12.783 4.616a3.501 3.501 0 0 0 -6.783 1.217v5.067l6 3.45" />
    <path d="M18.786 8.986a3.501 3.501 0 0 0 -4.446 -5.266l-4.34 2.534v6.946" />
    <path d="M18 16.302c1.391 .236 2.787 -.395 3.534 -1.689a3.474 3.474 0 0 0 -1.271 -4.745l-4.308 -2.514l-5.955 3.42" />
  </g>,
  tablerIconProps,
);

export const fullscreenIcon = <Maximize />;

export const eyeIcon = <Eye />;

export const eyeClosedIcon = <EyeOff />;

export const brainIcon = <Brain />;

export const brainIconThin = <Brain strokeWidth={1} />;

export const searchIcon = <Search />;

export const clockIcon = <Clock />;

export const microphoneIcon = <Mic />;

export const microphoneMutedIcon = <MicOff />;

export const boltIcon = <Zap />;

export const selectAllIcon = <SquareDashedMousePointer />;

export const abacusIcon = createIcon(
  <g strokeWidth={1.25}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 3v18" />
    <path d="M19 21v-18" />
    <path d="M5 7h14" />
    <path d="M5 15h14" />
    <path d="M8 13v4" />
    <path d="M11 13v4" />
    <path d="M16 13v4" />
    <path d="M14 5v4" />
    <path d="M11 5v4" />
    <path d="M8 5v4" />
    <path d="M3 21h18" />
  </g>,
  tablerIconProps,
);

export const flipVertical = <FlipVertical />;

export const flipHorizontal = <FlipHorizontal />;

export const paintIcon = <Paintbrush />;

export const zoomAreaIcon = <SquareDashedMousePointer />;

export const svgIcon = <FileCode />;

export const pngIcon = <Image />;

export const magnetIcon = <Magnet />;

export const coffeeIcon = <Coffee />;

export const DeviceDesktopIcon = <Monitor />;

export const loginIcon = createIcon(
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
    <path d="M21 12h-13l3 -3" />
    <path d="M11 15l-3 -3" />
  </g>,
  tablerIconProps,
);

export const youtubeIcon = createIcon(
  <g>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z" />
    <path d="M10 9l5 3l-5 3z" />
  </g>,
  tablerIconProps,
);

export const gridIcon = <Grid3x3 />;

export const lineEditorIcon = <Spline />;

export const sharpArrowIcon = <ArrowRight />;

export const elbowArrowIcon = <CornerUpRight />;

export const roundArrowIcon = <MoveRight />;

export const collapseDownIcon = <ChevronsDown />;

export const collapseUpIcon = <ChevronsUp />;

export const upIcon = <ArrowUp />;

export const cropIcon = <Crop />;

export const elementLinkIcon = <Link2 />;

