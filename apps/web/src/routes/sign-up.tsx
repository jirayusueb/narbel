import { createFileRoute } from "@tanstack/react-router";

import { redirectSearch } from "@/app";
import { SignUpPage } from "@/pages/auth";

const SignUpRoute = () => (
  <SignUpPage redirectTo={Route.useSearch().redirect} />
);

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Create account · narbel" }] }),
  validateSearch: redirectSearch,
  component: SignUpRoute,
});
