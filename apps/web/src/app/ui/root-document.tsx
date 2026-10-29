import { Toaster } from "@narbel/ui/components/sonner";
import { HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Header } from "@/widgets/header";

import { Providers } from "../providers/providers";

export const RootDocument = () => (
  <html lang="en" className="dark">
    <head>
      <HeadContent />
    </head>
    <body>
      <Providers>
        <div className="grid h-svh grid-rows-[auto_minmax(0,1fr)]">
          <Header />
          <main className="min-h-0 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <Toaster theme="dark" richColors />
      </Providers>
      <TanStackRouterDevtools position="bottom-left" />
      <Scripts />
    </body>
  </html>
);
