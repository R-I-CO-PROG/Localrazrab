import { assetUrl } from "@/lib/asset-url";
import type { SlideVariant } from "./types";

export function slideVariantPreviewUrl(variant: SlideVariant): string | undefined {
  const raw =
    variant.snapshot.heroImage?.url ?? variant.snapshot.backgroundImage?.url;
  if (!raw) return undefined;
  return assetUrl(raw, variant.createdAt ?? variant.id);
}
