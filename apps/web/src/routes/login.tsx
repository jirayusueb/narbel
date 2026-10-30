import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "@/pages/login";
import { safeRedirect } from "@/shared/lib";

const LoginRoute = () => <LoginPage redirectTo={Route.useSearch().redirect} />;

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginRoute,
});
