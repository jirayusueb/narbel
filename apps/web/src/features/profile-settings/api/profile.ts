import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const useProfileMutation = <V>(run: (variables: V) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    // Avatars and names are embedded in comments, members and notifications too.
    onSuccess: () => queryClient.invalidateQueries(),
  });
};

export const useUpdateName = () =>
  useProfileMutation(async (name: string) =>
    unwrap(await api.api.me.patch({ name }))
  );

export const useUploadAvatar = () =>
  useProfileMutation(async (file: File) => {
    const { uploadUrl, key } = unwrap(
      await api.api.me.avatar.presign.post({
        mimeType: file.type,
        size: file.size,
      })
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error("Upload failed. Try again.");
    }
    unwrap(await api.api.me.avatar.post({ key }));
  });

export const useRemoveAvatar = () =>
  useProfileMutation(async () => unwrap(await api.api.me.avatar.delete()));
