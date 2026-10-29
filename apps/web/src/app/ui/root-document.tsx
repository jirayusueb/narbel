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
  // The board is a full-viewport canvas with its own chrome; every other page scrolls the document.
  const onBoard = useRouterState({
    select: (state) => state.location.pathname.startsWith("/boards/"),
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={onBoard ? "overscroll-none" : undefined}>
        <Providers>
          <MotionConfig reducedMotion="user">
            <div className="flex min-h-svh flex-col">
              {onBoard ? null : <Header />}
              <main className="flex flex-1 flex-col">
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
