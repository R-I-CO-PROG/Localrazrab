"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/project-store";
import { notify } from "@/lib/notify";
import { BrandPalettePanel } from "@/components/brand/brand-palette-panel";
import { useDropzone } from "react-dropzone";
import { ACCEPTED_FILE_TYPES } from "@/lib/types";
import type { UploadedFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePasteImageUpload } from "@/hooks/use-paste-image-upload";
import { analyzeBrandFile } from "@/lib/brand-color-analysis";
import { syncBrandLibraryFromServer } from "@/lib/brand-library-sync";
import {
  brandAssetToUploadedFile,
  deleteBrandAsset as deleteBrandAssetApi,
  uploadBrandAsset,
} from "@/lib/brand-assets-client";

function LibraryUploadCard({
  slotType,
  title,
  onUpload,
}: {
  slotType: "LOGO" | "BRANDBOOK";
  title: string;
  onUpload: (file: UploadedFile) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const applyDetectedBrandPalette = useProjectStore((s) => s.applyDetectedBrandPalette);

  const processFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const assetType = slotType === "LOGO" ? "logo" : "brandbook";
        const asset = await uploadBrandAsset(file, assetType);
        const uploaded = brandAssetToUploadedFile(asset);
        onUpload(uploaded);
        notify.success("Файл сохранён в библиотеке аккаунта");

        if (file.type.startsWith("image/") || file.type === "application/pdf") {
          try {
            const result = await analyzeBrandFile(file);
            if (result.colors.length > 0) {
              applyDetectedBrandPalette(result.colors, result.style, slotType);
              notify.success("Цвета распознаны — нажмите «Из логотипа/брендбука»");
            } else if (result.message) {
              notify.info(result.message);
            }
          } catch {
            notify.error("Не удалось проанализировать файл");
          }
        }
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Не удалось загрузить файл");
      } finally {
        setUploading(false);
      }
    },
    [applyDetectedBrandPalette, onUpload, slotType],
  );

  const paste = usePasteImageUpload({
    enabled: true,
    zoneId: `brandbooks-${slotType}`,
    fileNameStem: slotType === "LOGO" ? "logo" : "brandbook",
    onFile: (file) => void processFile(file),
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      const file = files[0];
      if (file) void processFile(file);
    },
    accept: ACCEPTED_FILE_TYPES,
    maxSize: 20 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div {...paste.pasteZoneProps} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
    <div
      {...getRootProps()}
      className={cn(
        "rounded-xl border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
        isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
      )}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">Кликните сюда, затем Ctrl+V</p>
    </div>
    </div>
  );
}

export default function BrandbooksPage() {
  const brandLibrary = useProjectStore((s) => s.brandLibrary);
  const formFiles = useProjectStore((s) => s.formData.files);
  const deleteBrandAsset = useProjectStore((s) => s.deleteBrandAsset);
  const addBrandFile = useProjectStore((s) => s.addBrandFile);
  const brandPalette = useProjectStore((s) => s.brandPalette);
  const setBrandColorAt = useProjectStore((s) => s.setBrandColorAt);
  const resetBrandColors = useProjectStore((s) => s.resetBrandColors);
  const removeColor = useProjectStore((s) => s.removeColor);
  const applyBrandColorsFromAssets = useProjectStore((s) => s.applyBrandColorsFromAssets);

  useEffect(() => {
    void syncBrandLibraryFromServer();
  }, []);

  const sortByNewest = (files: UploadedFile[]) =>
    [...files].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  const brandFiles = useMemo(() => {
    const ids = new Set(brandLibrary.map((f) => f.id));
    const fromForm = formFiles.filter(
      (f) => (f.fileType === "BRANDBOOK" || f.fileType === "LOGO") && !ids.has(f.id),
    );
    return [...brandLibrary, ...fromForm];
  }, [brandLibrary, formFiles]);

  const logos = sortByNewest(brandFiles.filter((f) => f.fileType === "LOGO"));
  const brandbooks = sortByNewest(brandFiles.filter((f) => f.fileType === "BRANDBOOK"));

  const handleDeleteAsset = (fileId: string, fileName: string) => {
    notify.confirm(`Удалить «${fileName}»?`, {
      onConfirm: () => {
        void (async () => {
          try {
            if (!fileId.startsWith("file-")) {
              await deleteBrandAssetApi(fileId);
            }
            deleteBrandAsset(fileId);
            notify.success("Файл удалён");
          } catch (e) {
            notify.error(e instanceof Error ? e.message : "Не удалось удалить файл");
          }
        })();
      },
    });
  };

  return (
    <div className="min-w-0 space-y-8 overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Брендбук и лого</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Загрузка, анализ цветов и управление фирменным стилем
        </p>
      </motion.div>

      <BrandPalettePanel
        palette={brandPalette}
        onColorChange={setBrandColorAt}
        onRemoveColor={removeColor}
        onReset={resetBrandColors}
        onApplyFromBrand={() => {
          applyBrandColorsFromAssets();
          notify.success("Цвета из логотипа/брендбука добавлены");
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ImageIcon className="h-5 w-5 text-primary" />
            Лого
          </h2>
          <LibraryUploadCard slotType="LOGO" title="Загрузить логотип" onUpload={addBrandFile} />
          <div className="grid gap-3 sm:grid-cols-2">
            {logos.map((file) => (
              <BrandAssetCard key={file.id} file={file} onDelete={() => handleDeleteAsset(file.id, file.name)} />
            ))}
          </div>
          {logos.length === 0 && (
            <p className="text-sm text-muted-foreground">Логотип ещё не загружен</p>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-primary" />
            Брендбук
          </h2>
          <LibraryUploadCard slotType="BRANDBOOK" title="Загрузить брендбук" onUpload={addBrandFile} />
          <div className="grid gap-3 sm:grid-cols-2">
            {brandbooks.map((file) => (
              <BrandAssetCard key={file.id} file={file} onDelete={() => handleDeleteAsset(file.id, file.name)} />
            ))}
          </div>
          {brandbooks.length === 0 && (
            <p className="text-sm text-muted-foreground">Брендбук ещё не загружен</p>
          )}
        </section>
      </div>
    </div>
  );
}

function BrandAssetCard({
  file,
  onDelete,
}: {
  file: { id: string; name: string; url: string; type: string; fileType: string };
  onDelete: () => void;
}) {
  return (
    <Card className="group relative min-w-0 overflow-hidden border-border/50">
      <CardContent className="p-4">
        {file.type.startsWith("image/") ? (
          <div className="mb-3 h-24 w-full overflow-hidden rounded-lg bg-secondary/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.url} alt={file.name} className="h-full w-full max-w-full object-contain" />
          </div>
        ) : (
          <BookOpen className="mb-3 h-8 w-8 text-primary" />
        )}
        <h3 className="truncate font-semibold pr-8" title={file.name}>
          {file.name}
        </h3>
        <Badge variant="secondary" className="mt-2">
          {file.fileType === "LOGO" ? "Логотип" : "Брендбук"}
        </Badge>
      </CardContent>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Удалить"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Card>
  );
}
