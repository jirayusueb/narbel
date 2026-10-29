import type { useCommentMutations } from "../api/comments";
import type { Mentionable } from "./mention";

export const REACTIONS = [
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "😂", label: "Laughing" },
  { emoji: "🎉", label: "Celebrate" },
  { emoji: "😮", label: "Surprised" },
  { emoji: "😢", label: "Sad" },
  { emoji: "👀", label: "Eyes" },
  { emoji: "🚀", label: "Rocket" },
] as const;

// Everything a thread needs from the board it lives on, so cards take one prop instead of seven.
export interface ThreadEnv {
  boardId: string;
  share?: string;
  canWrite: boolean;
  isOwner: boolean;
  userId: string;
  members: Mentionable[];
  mutations: ReturnType<typeof useCommentMutations>;
  pageName: (pageId: string) => string | undefined;
}
