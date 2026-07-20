"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { ConceptResultRow } from "@/components/concepts/concept-result-row";
import { useProjectStore } from "@/store/project-store";
import { retryAgentRun } from "@/lib/suvenir-client";
import { pollAgentRunUntilReady } from "@/lib/poll-agent-run";
import { parseAgentConceptsFromRun } from "@/lib/parse-agent-concepts";
import { mapAgentConceptsToGenerated } from "@/lib/map-agent-concepts";
import { mapCatalogConceptsToGenerated } from "@/lib/map-catalog-concepts";
import type { AgentConcept } from "@/lib/agent-types";
import { notify } from "@/lib/notify";

export default function ResultsPage() {
  const concepts = useProjectStore((s) => s.concepts);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projects = useProjectStore((s) => s.projects);
  const generationInputs = useProjectStore((s) => s.generationInputs);
  const setConcepts = useProjectStore((s) => s.setConcepts);
  const mergeConceptRenderSessions = useProjectStore((s) => s.mergeConceptRenderSessions);
  const project = projects.find((p) => p.id === currentProjectId);

  const [regenerating, setRegenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);

  const requestId = currentProjectId ?? undefined;
  const mode =
    generationInputs[requestId ?? ""]?.generationMode ?? project?.generationMode ?? "creative";
  const isCatalog = mode === "catalog";

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleRegenerate = async () => {
    if (!requestId || regenerating) return;
    if (selectMode && selectedIds.length === 0) {
      notify.error("Выберите хотя бы одну идею для перегенерации");
      return;
    }
    setRegenerating(true);
    try {
      await retryAgentRun(requestId, isCatalog ? "catalog" : "creative");
      const run = await pollAgentRunUntilReady(requestId);
      const agentConcepts = parseAgentConceptsFromRun(run) as AgentConcept[];
      if (!agentConcepts.length) {
        throw new Error("Не удалось подобрать концепции — попробуйте ещё раз");
      }
      const mapped = isCatalog
        ? mapCatalogConceptsToGenerated(agentConcepts, requestId)
        : mapAgentConceptsToGenerated(agentConcepts, requestId, generationInputs[requestId ?? ""]?.colors ?? []);

      if (!selectMode || selectedIds.length === 0) {
        setConcepts(mapped.concepts, requestId);
        mergeConceptRenderSessions(mapped.sessions);
        notify.success(`Готовы ${mapped.concepts.length} новых концепций`);
      } else {
        const selectedSet = new Set(selectedIds);
        let replaceIndex = 0;
        const merged = concepts.map((c) => {
          if (!c.id || !selectedSet.has(c.id)) return c;
          const replacement = mapped.concepts[replaceIndex++];
          return replacement ?? c;
        });
        setConcepts(merged, requestId);
        mergeConceptRenderSessions(mapped.sessions);
        notify.success(`Обновлено идей: ${Math.min(selectedIds.length, mapped.concepts.length)}`);
      }
      setSelectMode(false);
      setSelectedIds([]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Не удалось перегенерировать");
    } finally {
      setRegenerating(false);
    }
  };

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">Нет сгенерированных концепций</p>
        <Button asChild>
          <Link href="/generate">Создать концепции</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Результаты генерации</h1>
          <p className="mt-2 text-muted-foreground">
            {concepts.length} концепций
            {project?.title ? ` · ${project.title}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Выберите концепцию — на следующем шаге создайте финальную визуализацию
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <BackButton fallbackHref="/concepts" />
          {selectMode && (
            <>
              <Button
                variant="outline"
                onClick={() => setSelectedIds(concepts.map((c) => c.id).filter(Boolean) as string[])}
              >
                Выбрать все
              </Button>
              <Button variant="outline" onClick={() => setSelectedIds([])}>
                Снять выбор
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedIds([]);
            }}
          >
            {selectMode ? "Отмена выбора" : "Выбрать идеи"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleRegenerate}
            disabled={regenerating || !requestId || (selectMode && selectedIds.length === 0)}
            title={
              selectMode
                ? "Перегенерировать только выбранные идеи"
                : "Подобрать новые концепции с теми же параметрами"
            }
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {regenerating
              ? "Генерируем…"
              : selectMode
                ? `Перегенерировать (${selectedIds.length})`
                : "Перегенерировать идеи"}
          </Button>
        </div>
      </motion.div>

      <div className="flex flex-col gap-6">
        {concepts.map((concept, i) => {
          const checked = concept.id ? selectedIds.includes(concept.id) : false;
          return (
            <ConceptResultRow
              key={concept.id}
              concept={concept}
              index={i}
              selectMode={selectMode}
              selected={checked}
              onToggleSelect={concept.id ? () => toggleSelect(concept.id!) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
