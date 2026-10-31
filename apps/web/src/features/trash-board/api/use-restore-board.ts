import { useTrashTransition } from "@/entities/board";
import { api, unwrap } from "@/shared/api";

export const useRestoreBoard = () =>
  useTrashTransition(async (id) =>
    unwrap(await api.api.boards({ id }).restore.post())
  );
