"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface ConceptRefinePanelProps {
  onRefine: (brief: string) => Promise<void>;
  refining?: boolean;
  disabled?: boolean;
}

export function ConceptRefinePanel({ onRefine, refining = false, disabled = false }: ConceptRefinePanelProps) {
  const [brief, setBrief] = useState("");

  const handleSubmit = async () => {
    const text = brief.trim();
    if (text.length < 8 || refining || disabled) return;
    await onRefine(text);
    setBrief("");
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Перегенерировать визуализацию</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Опишите, что изменить в текущем фото. AI возьмёт выбранную версию как основу и создаст
          новую — предыдущие сохранятся в карусели.
        </p>
        <Textarea
          placeholder="Например: добавь больше зелени на стол, сделай свет теплее, крупнее логотип на блокноте…"
          value={brief}
          onChange={(e) => setBrief(e.target.value.slice(0, 500))}
          className="min-h-[88px] resize-none bg-background/80"
          disabled={refining || disabled}
        />
        <Button
          className="w-full gap-2"
          disabled={refining || disabled || brief.trim().length < 8}
          onClick={() => void handleSubmit()}
        >
          {refining ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Перегенерируем…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Перегенерировать
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
