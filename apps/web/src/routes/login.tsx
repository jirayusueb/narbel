import { createFileRoute } from "@tanstack/react-router";

import { redirectSearch } from "@/app";
import { LoginPage } from "@/pages/login";

const LoginRoute = () => <LoginPage redirectTo={Route.useSearch().redirect} />;

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · narbel" }] }),
  validateSearch: redirectSearch,
  component: LoginRoute,
});
