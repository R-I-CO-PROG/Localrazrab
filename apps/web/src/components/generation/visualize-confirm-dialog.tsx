"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  open: boolean;
  conceptTitle?: string | null;
  defaultProjectName: string;
  modeLabel?: string;
  loading?: boolean;
  onConfirm: (projectName: string) => void;
  onCancel: () => void;
};

export function VisualizeConfirmDialog({
  open,
  conceptTitle,
  defaultProjectName,
  modeLabel = "AI-визуализацию",
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const [name, setName] = useState(defaultProjectName);

  useEffect(() => {
    if (open) setName(defaultProjectName);
  }, [open, defaultProjectName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visualize-confirm-title"
    >
      <Card className="w-full max-w-md border-primary/20 shadow-glow-sm">
        <CardHeader>
          <CardTitle id="visualize-confirm-title" className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Визуализировать концепцию?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {conceptTitle ? (
            <p className="text-sm text-muted-foreground">
              Концепция:{" "}
              <span className="font-medium text-foreground">{conceptTitle}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Запустим {modeLabel}. Проект и прогресс сохранятся в «Мои проекты».
          </p>
          <div className="space-y-2">
            <Label htmlFor="project-name">Название проекта</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Welcome Pack для IT-команды"
              autoFocus
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !loading) onConfirm(name.trim());
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              className="gap-2"
              disabled={!name.trim() || loading}
              onClick={() => onConfirm(name.trim())}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Визуализировать
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={onCancel}>
              Отмена
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
