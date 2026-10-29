import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requireOnboarded } from "@/app";

export const Route = createFileRoute("/_auth")({
  ssr: false,
  component: Outlet,
  beforeLoad: requireOnboarded,
});
