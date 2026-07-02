"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LocaleProvider } from "@/i18n/provider";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchInterval: 10_000,
            refetchOnMount: "always",
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            staleTime: 0,
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
        },
      }),
  );
  return (
    <ThemeProvider>
      <LocaleProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
