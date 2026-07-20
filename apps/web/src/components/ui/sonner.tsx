"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      closeButton
      richColors
      expand
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-xl !border-border/60 !bg-card/95 !text-foreground !shadow-lg !backdrop-blur-md",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-muted-foreground",
          actionButton:
            "!rounded-lg !bg-primary !text-primary-foreground !text-xs !font-medium",
          cancelButton:
            "!rounded-lg !bg-secondary !text-secondary-foreground !text-xs !font-medium",
          closeButton:
            "!border-border/60 !bg-card !text-muted-foreground hover:!text-foreground",
        },
      }}
      {...props}
    />
  );
}
