import { Toaster } from "@narbel/ui/components/sonner";
import {
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Header } from "@/widgets/header";

import { Providers } from "../providers/providers";

export const RootDocument = () => {
  // The board is a full-height workspace with its own window bar.
  const onBoard = useRouterState({
    select: (state) => state.location.pathname.startsWith("/boards/"),
  });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <div
            className={
              onBoard ? "h-svh" : "grid h-svh grid-rows-[auto_minmax(0,1fr)]"
            }
          >
            {onBoard ? null : <Header />}
            <main className="h-full min-h-0 overflow-hidden">
              <Outlet />
            </main>
          </div>
          <Toaster position="bottom-center" />
        </Providers>
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
};
