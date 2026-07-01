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
            refetchInterval: 5000,
            refetchOnWindowFocus: false,
            staleTime: 2000,
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
