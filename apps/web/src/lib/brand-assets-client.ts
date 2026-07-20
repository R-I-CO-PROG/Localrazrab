import type { UploadedFile } from "@/lib/types";
import { assetUrl } from "@/lib/asset-url";
import { parseApiResponse } from "@/lib/safe-json-response";

export interface BrandAssetDto {
  id: string;
  type: "logo" | "brandbook";
  name: string;
  fileUrl: string;
  thumbnailUrl?: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function brandAssetToUploadedFile(asset: BrandAssetDto): UploadedFile {
  const fileType = asset.type === "logo" ? "LOGO" : "BRANDBOOK";
  const stableUrl = assetUrl(asset.fileUrl);
  const thumb = asset.thumbnailUrl ? assetUrl(asset.thumbnailUrl) : stableUrl;
  return {
    id: asset.id,
    name: asset.name,
    url: stableUrl,
    storageUrl: stableUrl,
    thumbnailUrl: thumb,
    type: asset.mimeType,
    size: asset.size,
    fileType,
    createdAt: asset.createdAt,
  };
}

export async function fetchBrandAssets(): Promise<BrandAssetDto[]> {
  const res = await fetch("/api/brand-assets");
  if (!res.ok) return [];
  try {
    const data = await parseApiResponse<{ assets?: BrandAssetDto[] }>(res);
    return data.assets ?? [];
  } catch {
    return [];
  }
}

export async function uploadBrandAsset(
  file: File,
  type: "logo" | "brandbook",
): Promise<BrandAssetDto> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  form.append("name", file.name);
  const res = await fetch("/api/brand-assets", { method: "POST", body: form });
  const data = await parseApiResponse<{ asset: BrandAssetDto; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Не удалось загрузить файл");
  }
  return data.asset;
}

export async function deleteBrandAsset(id: string): Promise<void> {
  const res = await fetch(`/api/brand-assets/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Не удалось удалить файл");
  }
}
