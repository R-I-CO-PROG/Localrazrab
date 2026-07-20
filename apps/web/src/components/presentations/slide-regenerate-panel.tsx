"use client";

import { useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SlideRegeneratePanelProps {
  open: boolean;
  onClose: () => void;
  onRegenerate: (input: { prompt: string; regenerateImage: boolean }) => Promise<void>;
  regenerating?: boolean;
  slideTitle?: string;
}

export function SlideRegeneratePanel({
  open,
  onClose,
  onRegenerate,
  regenerating = false,
  slideTitle,
}: SlideRegeneratePanelProps) {
  const [prompt, setPrompt] = useState("");

  if (!open) return null;

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (regenerating || text.length < 3) return;
    await onRegenerate({ prompt: text, regenerateImage: false });
    setPrompt("");
  };

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Перегенерация текста{slideTitle ? `: ${slideTitle}` : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          disabled={regenerating}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Опишите, что изменить в тексте слайда. Фото останется из каталога или визуализации.
      </p>
      <Textarea
        placeholder="Например: сделай заголовок короче, добавь акцент на экологичность…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
        className="min-h-[72px] resize-none"
        disabled={regenerating}
      />
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={regenerating || prompt.trim().length < 3}
          onClick={() => void handleSubmit()}
          className="gap-2"
        >
          {regenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Обновляем…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Обновить текст
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
