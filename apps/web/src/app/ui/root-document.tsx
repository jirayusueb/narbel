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
import { THEME_COLOR } from "../providers/theme-color";

export const RootDocument = () => {
  // The board is a full-viewport canvas with its own chrome; every other page scrolls the document.
  const onBoard = useRouterState({
    select: (state) => state.location.pathname.startsWith("/boards/"),
  });
  // Onboarding has no app to navigate yet, so it hides the header too.
  const bare = useRouterState({
    select: ({ location }) =>
      location.pathname.startsWith("/boards/") ||
      location.pathname === "/onboarding",
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Here, not in the route head(): the router keeps one meta per name, which dropped the light one. */}
        <meta
          name="theme-color"
          content={THEME_COLOR.light}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={THEME_COLOR.dark}
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className={onBoard ? "overscroll-none" : undefined}>
        <Providers>
          <MotionConfig reducedMotion="user">
            <div className="flex min-h-svh flex-col">
              {bare ? null : <Header />}
              <main className="flex flex-1 flex-col">
                <ViewTransition default="page-swap">
                  <Outlet />
                </ViewTransition>
              </main>
            </div>
            <Toaster position="bottom-center" />
          </MotionConfig>
        </Providers>
        {/* Every board corner holds canvas chrome (menu, Library, zoom, Help); the toggle would cover the zoom controls. */}
        {onBoard ? null : <TanStackRouterDevtools position="bottom-left" />}
        <Scripts />
      </body>
    </html>
  );
};
