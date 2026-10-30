import { Button } from "@narbel/ui/components/button";
import { Spinner } from "@narbel/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/shared/lib";
import { BrandMark, Loader } from "@/shared/ui";

const SCOPE_WORDS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name and avatar",
  email: "See your email address",
  offline_access: "Stay signed in without asking again",
};

const describe = (scope: string) => SCOPE_WORDS[scope] ?? scope;

export const ConsentPage = ({
  clientId,
  scope,
}: {
  clientId: string;
  scope: string;
}) => {
  const scopes = scope.split(" ").filter(Boolean);
  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    queryFn: async () => {
      const { data, error } = await authClient.oauth2.publicClient({
        query: { client_id: clientId },
      });
      if (error || !data) {
        throw new Error(error?.message ?? "Unknown application");
      }
      return data;
    },
    enabled: Boolean(clientId),
    retry: false,
  });
  const answer = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data, error } = await authClient.oauth2.consent({ accept });
      if (error || !data?.url) {
        throw new Error(error?.message ?? "Could not finish authorizing");
      }
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });

  if (client.isPending && clientId) {
    return <Loader />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 py-10 md:px-[30px]">
        <div className="bg-card shadow-surface flex w-full max-w-md flex-col gap-8 rounded-xl p-6 sm:p-8">
          <BrandMark className="size-10" />
          {client.data ? (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="font-display text-headline leading-tight font-normal">
                  Connect {client.data.client_name ?? "this app"}?
                </h1>
                <p className="text-muted-foreground text-sm">
                  It will act on your boards as you. This is what it asks for.
                </p>
              </div>
              <ul
                aria-label="Requested access"
                className="flex list-disc flex-col gap-1 pl-5 text-sm"
              >
                {scopes.map((item) => (
                  <li key={item}>{describe(item)}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  isDisabled={answer.isPending}
                  onPress={() => answer.mutate(true)}
                >
                  {answer.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Allow
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={answer.isPending}
                  onPress={() => answer.mutate(false)}
                >
                  Deny
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-headline leading-tight font-normal">
                Nothing to approve
              </h1>
              <p className="text-muted-foreground text-sm">
                This link is missing its request, or the app is unknown. Start
                again from the app you were connecting.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
