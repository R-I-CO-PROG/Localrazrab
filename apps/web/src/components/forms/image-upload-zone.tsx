"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePasteImageUpload } from "@/hooks/use-paste-image-upload";

interface ImageUploadZoneProps {
  children: ReactNode;
  onFile: (file: File) => void;
  enabled?: boolean;
  className?: string;
  hint?: string;
  zoneId?: string;
  fileNameStem?: string;
}

/** Обёртка для зон загрузки: вставка Ctrl+V в активную зону */
export function ImageUploadZone({
  children,
  onFile,
  enabled = true,
  className,
  hint = "Кликните на область и вставьте изображение (Ctrl+V)",
  zoneId,
  fileNameStem = "image",
}: ImageUploadZoneProps) {
  const paste = usePasteImageUpload({ enabled, onFile, zoneId, fileNameStem });

  return (
    <div {...paste.pasteZoneProps} className={cn("min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}>
      {children}
      {enabled && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
