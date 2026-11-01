import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/pages/dashboard";

export const Route = createFileRoute("/_auth/dashboard")({
  head: () => ({ meta: [{ title: "Boards · narbel" }] }),
  component: DashboardPage,
});
