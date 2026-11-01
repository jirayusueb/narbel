import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { OverlayProvider } from "overlay-kit";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { ThemeColor } from "./theme-color";

export const Providers = ({ children }: { children: ReactNode }) => {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeColor />
      <QueryClientProvider client={queryClient}>
        <OverlayProvider>{children}</OverlayProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};
