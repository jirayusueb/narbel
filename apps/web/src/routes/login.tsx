import { createFileRoute } from "@tanstack/react-router";

// Old links and OAuth requests started before the split land here. The query moves
// untouched: the router's redirect re-parses it (a long numeric `state` loses digits),
// and a signed OAuth request must reach /sign-in byte for byte.
export const Route = createFileRoute("/login")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(null, {
          status: 307,
          headers: { Location: `/sign-in${new URL(request.url).search}` },
        }),
    },
  },
});
