import { Toaster } from "@narbel/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { MotionConfig } from "motion/react";
import { ViewTransition } from "react";

import { Header } from "@/widgets/header";

import { Providers } from "../providers/providers";

export const RootDocument = () => {
  // The board is a full-height workspace with its own window bar; onboarding has no app to navigate yet.
  const bare = useRouterState({
    select: ({ location }) =>
      location.pathname.startsWith("/boards/") ||
      location.pathname === "/onboarding",
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <MotionConfig reducedMotion="user">
            <div
              className={
                bare ? "h-svh" : "grid h-svh grid-rows-[auto_minmax(0,1fr)]"
              }
            >
              {bare ? null : <Header />}
              <main className="h-full min-h-0 overflow-hidden">
                <ViewTransition default="page-swap">
                  <Outlet />
                </ViewTransition>
              </main>
            </div>
            <Toaster position="bottom-center" />
          </MotionConfig>
        </Providers>
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
};
