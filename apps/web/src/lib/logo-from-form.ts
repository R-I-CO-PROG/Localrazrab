import type { ProjectFormData } from "@/lib/types";

/** Логотип из формы / библиотеки бренда → File для загрузки в request.assets */
export async function logoFileFromFormFiles(
  files: ProjectFormData["files"],
): Promise<File | null> {
  const logo = files.find((f) => f.fileType === "LOGO");
  const src = logo?.storageUrl ?? logo?.url;
  if (!logo || !src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], logo.name || "logo.png", { type: logo.type || blob.type });
  } catch {
    return null;
  }
}
