import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/app";
import { ConsentPage } from "@/pages/consent";

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
  beforeLoad: ({ location }) => requireSession(location),
  component: ConsentRoute,
});
