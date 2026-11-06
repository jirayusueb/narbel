import { createFileRoute } from "@tanstack/react-router";

import { ScratchPage } from "@/pages/scratch";

// No auth guard: drawing here needs no account, and nothing leaves the browser.
export const Route = createFileRoute("/scratch")({
  head: () => ({ meta: [{ title: "Scratch · narbel" }] }),
  ssr: false,
  component: ScratchPage,
});
