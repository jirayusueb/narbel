import { createFileRoute } from "@tanstack/react-router";

import { redirectSearch, requireNotOnboarded } from "@/app";
import { OnboardingPage } from "@/pages/onboarding";

const OnboardingRoute = () => (
  <OnboardingPage redirectTo={Route.useSearch().redirect} />
);

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  validateSearch: redirectSearch,
  beforeLoad: requireNotOnboarded,
  component: OnboardingRoute,
});
