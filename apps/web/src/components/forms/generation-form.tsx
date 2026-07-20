"use client";



import { useState } from "react";

import { LayoutGroup, motion } from "framer-motion";

import { Sparkles, Loader2 } from "lucide-react";
import { AgentLoadingButton } from "./agent-loading-button";
import type { AgentDiscoveryStatus } from "@/lib/agent-discovery-status";
import { notify } from "@/lib/notify";

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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ColorPicker } from "./color-picker";

import { MultiSelect } from "./multi-select";

import { NumberField } from "./number-field";

import { BrandFilesSection } from "./brand-files-section";
import { BrandPalettePanel } from "@/components/brand/brand-palette-panel";
import { ProductCountRange } from "./product-count-range";
import { Switch } from "@/components/ui/switch";

import {

  PROJECT_CATEGORIES,

  ALLOWED_CATEGORIES,

  EXCLUDED_CATEGORIES,

  DESCRIPTION_MAX_LENGTH,

} from "@/lib/types";

import { useProjectStore } from "@/store/project-store";

import { useDbUser } from "@/hooks/use-db-user";

import type { GenerationMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Минимум кредитов для «Подобрать параметры из брифа» */
const BRIEF_PARSE_MIN_CREDITS = 5;

const PARAM_LAYOUT_TRANSITION = {
  layout: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as const },
};

function ParamFieldCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout
      transition={PARAM_LAYOUT_TRANSITION}
      className={cn("min-w-0", className)}
    >
      {children}
    </motion.div>
  );
}

interface GenerationFormProps {
  generationMode: GenerationMode;
  onGenerate: () => void;
  draftRequestId?: string | null;
  onDraftRequestId?: (id: string) => void;
  agentLoadingStatus?: AgentDiscoveryStatus | null;
}

export function GenerationForm({
  generationMode,
  onGenerate,
  draftRequestId: _draftRequestId,
  onDraftRequestId: _onDraftRequestId,
  agentLoadingStatus,
}: GenerationFormProps) {
  const {

    formData,

    isGenerating,

    setFormField,

    setQuantity,

    setBudgetPerUnit,

    addColor,

    removeColor,

    toggleAllowedItem,

    toggleExcludedItem,

    addAllowedItem,

    addExcludedItem,

    applyBriefParse,

    brandPalette,

    setBrandColorAt,

    resetBrandColors,

    applyBrandColorsFromAssets,

  } = useProjectStore();



  const [parsingBrief, setParsingBrief] = useState(false);

  const dbUser = useDbUser(true);

  const isValid = formData.description.trim().length >= 20;

  const hasEnoughCreditsForBrief =
    dbUser === null || dbUser.credits >= BRIEF_PARSE_MIN_CREDITS;

  const canParseBrief =
    formData.description.trim().length >= 12 && hasEnoughCreditsForBrief;

  const briefTooltip = !hasEnoughCreditsForBrief
    ? `Для использования функции требуется минимум ${BRIEF_PARSE_MIN_CREDITS} кредитов.`
    : formData.description.trim().length >= 12
      ? "Заполнить категорию, тираж, бюджет, товаров в наборе и цвета"
      : "Нужно минимум 12 символов";

  const isCatalog = (generationMode ?? formData.generationMode) === "catalog";



  const handleParseBrief = async () => {

    const prompt = formData.description.trim();

    if (!canParseBrief || parsingBrief) return;



    setParsingBrief(true);

    try {

      const res = await fetch("/api/brief/parse", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ userPrompt: prompt }),

      });

      const parsed = await res.json();

      if (!res.ok)
        throw new Error(parsed.error || parsed.message || "Не удалось разобрать бриф");

      applyBriefParse(parsed);

    } catch (e) {

      notify.error(e instanceof Error ? e.message : "Не удалось разобрать бриф");

    } finally {

      setParsingBrief(false);

    }

  };



  const generateLabel =
    generationMode === "creative" ? "Сгенерировать концепции" : "Подобрать 5 наборов из каталога";



  return (

    <div className="min-w-0 space-y-6 overflow-hidden">

      <Card className="border-border/50 bg-card/80">

        <CardHeader>

          <CardTitle className="text-lg">Описание задачи</CardTitle>

        </CardHeader>

        <CardContent>

          <Textarea

            placeholder="Опишите компанию, цель сувенирной продукции, аудиторию, стиль бренда и пожелания...



Пример: Нужно подобрать welcome pack для IT-компании на 300 сотрудников. Стиль современный минималистичный. Аудитория — разработчики и дизайнеры."

            value={formData.description}

            onChange={(e) =>

              setFormField("description", e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))

            }

            maxLength={DESCRIPTION_MAX_LENGTH}

            className="min-h-[160px]"

          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">

            <p className="text-xs text-muted-foreground">

              Минимум 20 символов · {formData.description.length} /{" "}

              {DESCRIPTION_MAX_LENGTH.toLocaleString("ru-RU")}

            </p>

            <Button

              type="button"

              variant="outline"

              size="sm"

              onClick={handleParseBrief}

              disabled={!canParseBrief || parsingBrief || isGenerating}

              className="gap-1.5 shrink-0"

              title={briefTooltip}

            >

              {parsingBrief ? (

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

              ) : (

                <Sparkles className="h-3.5 w-3.5" />

              )}

              Подобрать параметры из брифа

            </Button>

          </div>

        </CardContent>

      </Card>



      <LayoutGroup>
        <motion.div
          key={isCatalog ? "params-catalog" : "params-creative"}
          layout
          transition={PARAM_LAYOUT_TRANSITION}
          className={cn(
            "grid grid-cols-1 gap-6",
            isCatalog ? "md:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          <ParamFieldCard>
            <Card className="h-full border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Категория проекта</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <Select
                  value={formData.categoryPreset}
                  onValueChange={(v) => setFormField("categoryPreset", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1.5">
                  <Label htmlFor="category-custom" className="text-xs text-muted-foreground">
                    Или укажите свой вариант
                  </Label>
                  <Input
                    id="category-custom"
                    placeholder="Например: Корпоративный ивент для стартапа"
                    value={formData.categoryCustom}
                    onChange={(e) => setFormField("categoryCustom", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </ParamFieldCard>

          <ParamFieldCard>
            <Card className="h-full border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Тираж</CardTitle>
              </CardHeader>

              <CardContent>
                <NumberField
                  min={1}
                  max={100000}
                  fallback={1}
                  value={formData.quantity}
                  onCommit={(v) => setQuantity(v)}
                />
                <p className="mt-2 text-xs text-muted-foreground">Сколько наборов произвести</p>
              </CardContent>
            </Card>
          </ParamFieldCard>

          {isCatalog && (
            <ParamFieldCard key="catalog-product-count">
              <Card className="h-full border-border/50 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-lg">Товаров в наборе</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Ограничивать количество</p>
                      <p className="text-xs text-muted-foreground">
                        {formData.useProductCountLimit
                          ? "Подбор в заданном диапазоне SKU"
                          : "Система выберет оптимальное число под идею"}
                      </p>
                    </div>
                    <Switch
                      checked={formData.useProductCountLimit}
                      onCheckedChange={(v) => setFormField("useProductCountLimit", v)}
                    />
                  </div>

                  {formData.useProductCountLimit ? (
                    <ProductCountRange
                      min={formData.minProductsPerSet}
                      max={formData.maxProductsPerSet}
                      onChange={(min, max) => {
                        setFormField("minProductsPerSet", min);
                        setFormField("maxProductsPerSet", max);
                        setFormField("setItemCount", Math.round((min + max) / 2));
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Количество товаров определяется брифом и логикой концепции
                    </p>
                  )}
                </CardContent>
              </Card>
            </ParamFieldCard>
          )}
        </motion.div>
      </LayoutGroup>



      {isCatalog && (
        <Card className="border-border/50 bg-card/80">

          <CardHeader>

            <CardTitle className="text-lg">Бюджет</CardTitle>

          </CardHeader>

          <CardContent className="space-y-2">

            <NumberField
              min={100}
              fallback={1000}
              value={formData.budget}
              onCommit={(v) => setBudgetPerUnit(v)}
            />

            <p className="text-xs text-muted-foreground">
              Бюджет на один набор, ₽ — подбор соберёт товары в эту сумму
            </p>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Бюджет на закупку (справочно): тираж × набор
              </span>
              <span className="font-medium">
                {((formData.quantity || 0) * (formData.budget || 0)).toLocaleString("ru-RU")} ₽
              </span>
            </div>

          </CardContent>

        </Card>
      )}





      <Card className="border-border/50 bg-card/80">

        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">

          <CardTitle className="text-lg">Цветовая гамма</CardTitle>

        </CardHeader>

        <CardContent className="space-y-4">

          <BrandPalettePanel
            palette={brandPalette}
            onColorChange={setBrandColorAt}
            onRemoveColor={removeColor}
            onReset={resetBrandColors}
            onApplyFromBrand={() => {
              applyBrandColorsFromAssets();
              notify.success("Цвета из логотипа/брендбука добавлены");
            }}
            className="border-0 bg-transparent p-0"
          />

          <ColorPicker colors={formData.colors} onAdd={addColor} onRemove={removeColor} />

        </CardContent>

      </Card>



      {isCatalog && (

        <div className="grid min-w-0 gap-6 md:grid-cols-2">

          <Card className="min-w-0 overflow-hidden border-border/50 bg-card/80">

            <CardHeader>

              <CardTitle className="text-lg">Что можно предлагать</CardTitle>

            </CardHeader>

            <CardContent className="min-w-0 overflow-hidden">

              <MultiSelect

                options={ALLOWED_CATEGORIES}

                selected={formData.allowedItems}

                onToggle={toggleAllowedItem}

                onAddCustom={addAllowedItem}

                customPlaceholder="Добавить категорию..."

              />

            </CardContent>

          </Card>



          <Card className="min-w-0 overflow-hidden border-border/50 bg-card/80">

            <CardHeader>

              <CardTitle className="text-lg">Что нельзя предлагать</CardTitle>

            </CardHeader>

            <CardContent className="min-w-0 overflow-hidden">

              <MultiSelect

                options={EXCLUDED_CATEGORIES}

                selected={formData.excludedItems}

                onToggle={toggleExcludedItem}

                onAddCustom={addExcludedItem}

                variant="danger"

                customPlaceholder="Добавить ограничение..."

              />

            </CardContent>

          </Card>

        </div>

      )}



      <BrandFilesSection />



      <motion.div whileTap={{ scale: isGenerating ? 1 : 0.98 }}>
        <AgentLoadingButton
          className="text-base"
          disabled={!isValid}
          loading={isGenerating}
          progress={agentLoadingStatus?.progress ?? (isGenerating ? 8 : 0)}
          statusLabel={
            agentLoadingStatus?.label ??
            (isCatalog ? "Подбираем наборы…" : "Генерируем концепции…")
          }
          statusComment={
            agentLoadingStatus?.sublabel ??
            (isCatalog
              ? "Собираем 5 наборов под задачу и бюджет…"
              : "Придумываем несколько сильных направлений…")
          }
          idleLabel={generateLabel}
          onClick={onGenerate}
        />
      </motion.div>

    </div>

  );

}


