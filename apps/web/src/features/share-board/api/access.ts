import { useMutation, useQueryClient } from "@tanstack/react-query";

import { boardKeys } from "@/entities/board";
import { api, unwrap } from "@/shared/api";

interface AccessPatch {
  visibility?: "private" | "link" | "password";
  password?: string | null;
  shareTokenEnabled?: boolean;
  shareRole?: "editor" | "viewer";
  shareExpiresAt?: string | null;
}

const useAccessMutation = <V>(
  id: string,
  run: (variables: V) => Promise<unknown>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    // An invite whose email failed still created the access row, so errors refresh too.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKeys.access(id) }),
  });
};

export const usePatchAccess = (id: string) =>
  useAccessMutation(id, async (patch: AccessPatch) =>
    unwrap(await api.api.boards({ id }).access.patch(patch))
  );

export const useInviteMember = (id: string) =>
  useAccessMutation(
    id,
    async (invite: { email: string; role: "editor" | "viewer" }) =>
      unwrap(await api.api.boards({ id }).invite.post(invite))
  );

export const useRemoveMember = (id: string) =>
  useAccessMutation(id, async (member: string) =>
    unwrap(
      await api.api
        .boards({ id })
        // Eden encodes path params itself; encoding here too turned "@" into %2540 and a 404
        .access.members({ member })
        .delete()
    )
  );

export const useUnlockBoard = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) =>
      unwrap(await api.api.boards({ id }).unlock.post({ password })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["boards", id] }),
  });
};
