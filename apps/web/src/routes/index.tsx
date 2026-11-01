import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/pages/home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "narbel: one board for your team and its agents" }],
  }),
  component: HomePage,
});
