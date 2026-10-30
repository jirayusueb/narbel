import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { ErrorState, Loader, NotFound } from "@/shared/ui";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Hash links glide to their section; scroll restoration on navigation stays instant.
  const glide =
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const router = createTanStackRouter({
    routeTree,
    // The board never scrolls; restoring would write stale offsets over the page strip.
    scrollRestoration: ({ location }) =>
      !location.pathname.startsWith("/boards/"),
    defaultHashScrollIntoView: {
      behavior: glide ? "smooth" : "auto",
      block: "start",
    },
    defaultPreloadStaleTime: 0,
    // Router state lives in an external store, so navigations are not React transitions and
    // React's <ViewTransition> only covers Suspense reveals; the router starts page transitions.
    defaultViewTransition: true,
    context: {},
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: ErrorState,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
