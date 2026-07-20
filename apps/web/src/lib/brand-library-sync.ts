import {
  brandAssetToUploadedFile,
  fetchBrandAssets,
} from "@/lib/brand-assets-client";
import { useProjectStore } from "@/store/project-store";

/** Подтягивает все логотипы и брендбуки аккаунта в локальную библиотеку (без смены выбора в форме). */
export async function syncBrandLibraryFromServer(): Promise<number> {
  const assets = await fetchBrandAssets();
  if (!assets.length) return 0;

  const { addBrandFile } = useProjectStore.getState();
  const existingIds = new Set(useProjectStore.getState().brandLibrary.map((f) => f.id));
  let added = 0;
  for (const asset of assets) {
    const file = brandAssetToUploadedFile(asset);
    if (!existingIds.has(file.id)) {
      addBrandFile(file, { select: false });
      existingIds.add(file.id);
      added += 1;
    }
  }
  return added;
}
