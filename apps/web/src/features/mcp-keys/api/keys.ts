import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/shared/lib";

const keysKey = ["api-keys"] as const;

export const useApiKeys = () =>
  useQuery({
    queryKey: keysKey,
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list();
      if (error) {
        throw new Error(error.message ?? "Could not load API keys");
      }
      return data.apiKeys;
    },
  });

export const useCreateApiKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await authClient.apiKey.create({ name });
      if (error) {
        throw new Error(error.message ?? "Could not create API key");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keysKey }),
  });
};

export const useRevokeApiKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await authClient.apiKey.delete({ keyId });
      if (error) {
        throw new Error(error.message ?? "Could not revoke API key");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keysKey }),
  });
};
