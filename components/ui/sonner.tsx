"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      closeButton
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-lg border-slate-200 shadow-[0_18px_45px_rgba(15,23,42,0.16)]",
          title: "text-sm font-semibold",
          description: "text-xs",
        },
      }}
    />
  );
}
