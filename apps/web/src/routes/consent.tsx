import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchSession } from "@/entities/session";
import { ConsentPage } from "@/pages/consent";
import { safeRedirect } from "@/shared/lib";

const text = (value: unknown) => (typeof value === "string" ? value : "");

const ConsentRoute = () => {
  const { client_id: clientId, scope } = Route.useSearch();
  return <ConsentPage clientId={clientId} scope={scope} />;
};

export const Route = createFileRoute("/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    client_id: text(search.client_id),
    scope: text(search.scope),
  }),
  beforeLoad: async ({ location }) => {
    const session = await fetchSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
        search: { redirect: safeRedirect(location.href) },
      });
    }
  },
  component: ConsentRoute,
});
