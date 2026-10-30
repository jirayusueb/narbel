import { createFileRoute } from "@tanstack/react-router";

import { requireNotOnboarded } from "@/app";
import { OnboardingPage } from "@/pages/onboarding";
import { safeRedirect } from "@/shared/lib";

const OnboardingRoute = () => (
  <OnboardingPage redirectTo={Route.useSearch().redirect} />
);

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: requireNotOnboarded,
  component: OnboardingRoute,
});
