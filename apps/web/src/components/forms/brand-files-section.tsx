"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, BookOpen, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_FILE_TYPES } from "@/lib/types";
import type { UploadedFile } from "@/lib/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectStore } from "@/store/project-store";
import { usePasteImageUpload } from "@/hooks/use-paste-image-upload";
import { analyzeBrandFile } from "@/lib/brand-color-analysis";
import { notify } from "@/lib/notify";
import type { BrandStyle } from "@/lib/brand-palette";
import { syncBrandLibraryFromServer } from "@/lib/brand-library-sync";
import { uploadBrandAsset, brandAssetToUploadedFile } from "@/lib/brand-assets-client";

type BrandSlotType = "LOGO" | "BRANDBOOK";

interface BrandFileSlotProps {
  slotType: BrandSlotType;
  title: string;
  description: string;
  icon: typeof ImageIcon;
  selected: UploadedFile | undefined;
  library: UploadedFile[];
  onUpload: (file: UploadedFile) => void;
  onSelect: (fileId: string) => void;
  onClear: () => void;
  onAnalyzed?: (colors: string[], style: BrandStyle) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BrandFileSlot({
  slotType,
  title,
  description,
  icon: Icon,
  selected,
  library,
  onUpload,
  onSelect,
  onClear,
  onAnalyzed,
}: BrandFileSlotProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const savedOfType = library
    .filter((f) => f.fileType === slotType)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  const processFile = useCallback(
    async (file: File) => {
      setAnalyzing(true);
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
              onAnalyzed?.(result.colors, result.style);
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
        setAnalyzing(false);
      }
    },
    [onAnalyzed, onUpload, slotType],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      void processFile(file);
    },
    [processFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: 20 * 1024 * 1024,
    multiple: false,
  });

  const paste = usePasteImageUpload({
    enabled: true,
    zoneId: `brand-slot-${slotType}`,
    fileNameStem: slotType === "LOGO" ? "logo" : "brandbook",
    onFile: (file) => void processFile(file),
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <Label className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      <div {...paste.pasteZoneProps} className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 transition-all cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/30",
        )}
      >
        <input {...getInputProps()} />
        {analyzing ? (
          <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" />
        ) : (
          <Upload className="mb-2 h-5 w-5 text-primary" />
        )}
        <p className="text-center text-xs font-medium">
          {isDragActive ? "Отпустите файл" : "Кликните сюда и вставьте (Ctrl+V)"}
        </p>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          PNG, JPG, WEBP, SVG, PDF · до 20 МБ
        </p>
      </div>
      </div>

      {savedOfType.length > 0 && (
        <Select value={selected?.id ?? ""} onValueChange={(id) => onSelect(id)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue
              placeholder={
                savedOfType.length > 1
                  ? `Выбрать из сохранённых (${savedOfType.length})`
                  : "Выбрать из сохранённых"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {savedOfType.map((file) => (
              <SelectItem key={file.id} value={file.id}>
                <span className="flex items-center gap-2">
                  {file.thumbnailUrl || file.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.thumbnailUrl ?? file.url}
                      alt=""
                      className="h-5 w-5 rounded object-contain"
                    />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{file.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3"
          >
            {selected.type.startsWith("image/") ? (
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.url}
                  alt={selected.name}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selected.size)}</p>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {savedOfType.length === 0 && !selected && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5" />
          Файлы сохраняются в библиотеке бренда
        </p>
      )}
    </div>
  );
}

export function BrandFilesSection() {
  const brandLibrary = useProjectStore((s) => s.brandLibrary);
  const files = useProjectStore((s) => s.formData.files);
  const addBrandFile = useProjectStore((s) => s.addBrandFile);
  const selectBrandFile = useProjectStore((s) => s.selectBrandFile);
  const clearFormBrandFile = useProjectStore((s) => s.clearFormBrandFile);
  const applyDetectedBrandPalette = useProjectStore((s) => s.applyDetectedBrandPalette);

  useEffect(() => {
    void syncBrandLibraryFromServer();
  }, []);

  const selectedLogo = files.find((f) => f.fileType === "LOGO");
  const selectedBrandbook = files.find((f) => f.fileType === "BRANDBOOK");

  const handleAnalyzed = (source: "LOGO" | "BRANDBOOK") => (colors: string[], style: BrandStyle) => {
    applyDetectedBrandPalette(colors, style, source);
  };

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <BrandFileSlot
        slotType="LOGO"
        title="Логотип"
        description="Загрузите логотип компании (PNG, JPG, SVG или PDF)"
        icon={ImageIcon}
        selected={selectedLogo}
        library={brandLibrary}
        onUpload={(file) => addBrandFile(file)}
        onSelect={(id) => selectBrandFile(id)}
        onClear={() => clearFormBrandFile("LOGO")}
        onAnalyzed={handleAnalyzed("LOGO")}
      />
      <BrandFileSlot
        slotType="BRANDBOOK"
        title="Брендбук"
        description="PDF или изображение с фирменным стилем"
        icon={BookOpen}
        selected={selectedBrandbook}
        library={brandLibrary}
        onUpload={(file) => addBrandFile(file)}
        onSelect={(id) => selectBrandFile(id)}
        onClear={() => clearFormBrandFile("BRANDBOOK")}
        onAnalyzed={handleAnalyzed("BRANDBOOK")}
      />
    </div>
  );
}
