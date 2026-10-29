import { createFileRoute } from "@tanstack/react-router";

import { requireNotOnboarded } from "@/app";
import { OnboardingPage } from "@/pages/onboarding";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: requireNotOnboarded,
  component: OnboardingPage,
});
