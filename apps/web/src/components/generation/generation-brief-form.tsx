"use client";

import { Loader2, Sparkles, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorPicker } from "@/components/forms/color-picker";
import { MultiSelect } from "@/components/forms/multi-select";
import { ALLOWED_CATEGORIES, EXCLUDED_CATEGORIES } from "@/lib/types";
import type { SuvenirAsset } from "@/lib/suvenir-types";

const CATEGORIES = [
  "Welcome Pack",
  "Корпоративные подарки",
  "Мерч",
  "Event Kit",
];

export interface BriefFormValues {
  userPrompt: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  quantity: number;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  notes: string;
}

type Props = {
  values: BriefFormValues;
  onChange: <K extends keyof BriefFormValues>(key: K, value: BriefFormValues[K]) => void;
  disabled?: boolean;
  variant?: "catalog" | "creative";
  parsingBrief?: boolean;
  onParseBrief?: () => void;
  assets: SuvenirAsset[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, type: "logo" | "reference") => void;
  onAddColor: (c: string) => void;
  onRemoveColor: (c: string) => void;
  onToggleAllowed: (item: string) => void;
  onToggleForbidden: (item: string) => void;
  onAddAllowed: (item: string) => void;
  onAddForbidden: (item: string) => void;
};

export function GenerationBriefForm({
  values,
  onChange,
  disabled,
  variant = "catalog",
  parsingBrief,
  onParseBrief,
  assets,
  onUpload,
  onAddColor,
  onRemoveColor,
  onToggleAllowed,
  onToggleForbidden,
  onAddAllowed,
  onAddForbidden,
}: Props) {
  const isCreative = variant === "creative";
  const canParse = values.userPrompt.trim().length >= 12;
  const logoAsset = assets.find((a) => a.type === "logo");

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label className="mb-2 block">Что нужно сделать?</Label>
          <Textarea
            value={values.userPrompt}
            onChange={(e) => onChange("userPrompt", e.target.value.slice(0, 1500))}
            disabled={disabled}
            rows={5}
            placeholder="Welcome pack для IT-компании на 300 человек, минималистичный tech-стиль…"
            className="min-h-[140px]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{values.userPrompt.length}/1500</span>
            {onParseBrief && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onParseBrief}
                disabled={disabled || parsingBrief || !canParse}
                className="gap-1.5"
              >
                {parsingBrief ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Подобрать параметры из брифа
              </Button>
            )}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">
            {isCreative ? "Логотип (обязательно)" : "Логотип и референсы"}
          </Label>
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 p-4">
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            {logoAsset ? (
              <p className="text-xs font-medium text-green-600">✓ Логотип загружен</p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                {isCreative ? "Загрузите логотип — он появится на сцене" : "PNG, JPG, SVG до 10 МБ"}
              </p>
            )}
            {!disabled && (
              <div className="flex flex-wrap justify-center gap-2">
                <label className="cursor-pointer">
                  <span className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium">Логотип</span>
                  <input type="file" className="hidden" accept="image/*,.svg" onChange={(e) => onUpload(e, "logo")} />
                </label>
                <label className="cursor-pointer">
                  <span className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium">Референс</span>
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => onUpload(e, "reference")} />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label className="mb-2 block">Категория</Label>
          <Select value={values.category} onValueChange={(v) => onChange("category", v)} disabled={disabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Тираж</Label>
          <Input
            type="number"
            min={1}
            value={values.quantity}
            onChange={(e) => onChange("quantity", Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="mb-2 block">
            Бюджет / ед.: {values.budgetMin} – {values.budgetMax} ₽
          </Label>
          <div className="flex gap-2 pt-1">
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={values.budgetMin}
              onChange={(e) =>
                onChange("budgetMin", Math.min(Number(e.target.value), values.budgetMax))
              }
              disabled={disabled}
              className="flex-1 accent-primary"
            />
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={values.budgetMax}
              onChange={(e) =>
                onChange("budgetMax", Math.max(Number(e.target.value), values.budgetMin))
              }
              disabled={disabled}
              className="flex-1 accent-primary"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Цвета</Label>
        <ColorPicker colors={values.colors} onAdd={onAddColor} onRemove={onRemoveColor} />
      </div>

      {!isCreative && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-2 block">Можно предлагать</Label>
            <MultiSelect
              options={ALLOWED_CATEGORIES}
              selected={values.allowedItems}
              onToggle={onToggleAllowed}
              onAddCustom={onAddAllowed}
            />
          </div>
          <div>
            <Label className="mb-2 block">Нельзя предлагать</Label>
            <MultiSelect
              options={EXCLUDED_CATEGORIES}
              selected={values.forbiddenItems}
              onToggle={onToggleForbidden}
              onAddCustom={onAddForbidden}
              variant="danger"
            />
          </div>
        </div>
      )}
    </div>
  );
}
