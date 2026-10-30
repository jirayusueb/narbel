import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useState } from "react";

import { useBoardMembers } from "@/entities/board";
import { useSession } from "@/entities/session";

import { useCommentMutations } from "../api/comments";
import type { Comment } from "../api/comments";
import type { ThreadEnv } from "./types";

// Panel, focused thread and the shared environment threads render against.
export const useCommentsWorkspace = ({
  boardId,
  shareToken,
  canWrite,
  isOwner,
  userId,
  focusComment,
  api,
  pages,
  setPageId,
}: {
  boardId: string;
  shareToken?: string;
  canWrite: boolean;
  isOwner: boolean;
  userId: string;
  focusComment?: string;
  api: ExcalidrawImperativeAPI | null;
  pages: { id: string; name: string }[];
  setPageId: (id: string) => void;
}) => {
  const [panelOpen, setPanelOpen] = useState(focusComment !== undefined);
  const [focusedId, setFocusedId] = useState<string | null>(
    focusComment ?? null
  );
  const { data: session } = useSession();
  const { data: members = [] } = useBoardMembers(
    boardId,
    shareToken,
    Boolean(session)
  );
  const mutations = useCommentMutations(boardId, shareToken);

  // A notification or email link names the thread to open, also while the board is already showing.
  const [seenFocus, setSeenFocus] = useState(focusComment);
  if (focusComment !== seenFocus) {
    setSeenFocus(focusComment);
    if (focusComment !== undefined) {
      setPanelOpen(true);
      setFocusedId(focusComment);
    }
  }

  const env: ThreadEnv = {
    boardId,
    share: shareToken,
    canWrite,
    isOwner,
    userId,
    members,
    mutations,
    pageName: (id) => pages.find((page) => page.id === id)?.name,
  };

  const selectThread = (thread: Comment | null) => {
    setFocusedId(thread?.id ?? null);
    if (!thread) {
      return;
    }
    setPanelOpen(true);
    setPageId(thread.pageId);
    const state = api?.getAppState();
    if (state) {
      api?.updateScene({
        appState: {
          scrollX: state.width / (2 * state.zoom.value) - thread.x,
          scrollY: state.height / (2 * state.zoom.value) - thread.y,
        } as unknown as AppState,
      });
    }
  };

  return { env, panelOpen, setPanelOpen, focusedId, selectThread };
};
