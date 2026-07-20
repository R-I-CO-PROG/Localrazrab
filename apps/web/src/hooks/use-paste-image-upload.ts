"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { notify } from "@/lib/notify";
import { registerPasteZone, unregisterPasteZone } from "@/lib/paste-image-target";

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "jpg";
}

export interface UsePasteImageUploadOptions {
  enabled?: boolean;
  onFile: (file: File) => void;
  /** Подпись для имени файла, например logo / brandbook */
  fileNameStem?: string;
  zoneId?: string;
}

export function usePasteImageUpload({
  enabled = true,
  onFile,
  fileNameStem = "image",
  zoneId: zoneIdProp,
}: UsePasteImageUploadOptions) {
  const reactId = useId();
  const zoneId = zoneIdProp ?? reactId;
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  const activate = useCallback(() => {
    if (!enabled) return;
    registerPasteZone(zoneId, (blob) => {
      const mime = blob.type || "image/png";
      if (!IMAGE_MIME.has(mime)) {
        notify.error("Поддерживаются PNG, JPG, WEBP и SVG");
        return;
      }
      const ext = extensionFromMime(mime);
      const file = new File([blob], `${fileNameStem}.${ext}`, { type: mime });
      onFileRef.current(file);
    });
  }, [enabled, fileNameStem, zoneId]);

  useEffect(() => {
    if (!enabled) {
      unregisterPasteZone(zoneId);
      return;
    }
    return () => unregisterPasteZone(zoneId);
  }, [enabled, zoneId]);

  return {
    zoneId,
    activate,
    pasteZoneProps: {
      "data-paste-zone": zoneId,
      tabIndex: 0,
      onMouseEnter: activate,
      onFocus: activate,
      onClick: activate,
    } as const,
  };
}
