import { createFileRoute } from "@tanstack/react-router";

import { redirectSearch } from "@/app";
import { SignInPage } from "@/pages/auth";

const SignInRoute = () => (
  <SignInPage redirectTo={Route.useSearch().redirect} />
);

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in · narbel" }] }),
  validateSearch: redirectSearch,
  component: SignInRoute,
});
