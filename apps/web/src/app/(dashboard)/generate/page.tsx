"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GenerationForm } from "@/components/forms/generation-form";
import { ProjectSidebar } from "@/components/forms/project-sidebar";
import {
  GenerationModeSwitcher,
  GENERATION_MODE_DESCRIPTIONS,
} from "@/components/forms/generation-mode-switcher";
import { useProjectStore } from "@/store/project-store";
import { toGenerationPayload } from "@/lib/generation-payload";
import type { ConceptGenerationInput } from "@/lib/generation-payload";
import { mapAgentConceptsToGenerated } from "@/lib/map-agent-concepts";
import { mapCatalogConceptsToGenerated } from "@/lib/map-catalog-concepts";
import type { GenerationMode, ProjectSummary } from "@/lib/types";
import type { AgentConcept } from "@/lib/agent-types";
import {
  getAgentDiscoveryStatus,
  type AgentDiscoveryStatus,
} from "@/lib/agent-discovery-status";
import { pollAgentRunUntilReady } from "@/lib/poll-agent-run";
import { parseAgentConceptsFromRun } from "@/lib/parse-agent-concepts";
import { getAgentRun, startAgentRun } from "@/lib/suvenir-client";
import { notify } from "@/lib/notify";
import { notifyCreditsUpdated } from "@/lib/credits-events";
import { getInsufficientCreditsMessage } from "@/lib/credit-errors";
import { parseApiResponse } from "@/lib/safe-json-response";
import { buildProjectTitle } from "@/lib/project-title";
import { logoFileFromFormFiles } from "@/lib/logo-from-form";

async function postConceptGenerate(input: ConceptGenerationInput, logoFile?: File | null) {
  if (logoFile) {
    const form = new FormData();
    form.append("payload", JSON.stringify(input));
    form.append("logo", logoFile);
    return fetch("/api/concepts/generate", { method: "POST", body: form });
  }
  return fetch("/api/concepts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export default function GeneratePage() {
  const router = useRouter();
  const [draftRequestId, setDraftRequestId] = useState<string | null>(null);
  const [agentLoadingStatus, setAgentLoadingStatus] = useState<AgentDiscoveryStatus | null>(
    null,
  );
  const agentStartedAtRef = useRef<number | null>(null);

  const {
    formData,
    setFormField,
    setConcepts,
    setIsGenerating,
    isGenerating,
    upsertProject,
    mergeConceptRenderSessions,
    setGenerationInput,
    blacklistItems,
  } = useProjectStore();

  const generationMode = formData.generationMode ?? "catalog";

  const handleModeChange = (mode: GenerationMode) => {
    setFormField("generationMode", mode);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setAgentLoadingStatus(null);
    agentStartedAtRef.current = null;

    try {
      const input: ConceptGenerationInput = {
        ...toGenerationPayload(formData, blacklistItems),
        requestId: draftRequestId ?? undefined,
      };

      if (input.generationMode === "creative") {
        const hasLogo = input.files.some((f) => f.fileType === "LOGO");
        if (!hasLogo) {
          throw new Error("Загрузите логотип — в креативном режиме он обязателен");
        }
      }

      const logo = await logoFileFromFormFiles(formData.files);
      if (input.generationMode === "creative" && !logo) {
        throw new Error(
          "Не удалось прочитать логотип. Загрузите файл заново — после обновления страницы blob-ссылка могла устареть.",
        );
      }
      const genRes = await postConceptGenerate(input, logo);
      const genData = await parseApiResponse<{
        phase?: string;
        requestId?: string;
        project?: ProjectSummary;
        message?: string;
        error?: string;
        creditsRemaining?: number;
        required?: number;
        available?: number;
        code?: string;
      }>(genRes);
      if (genRes.status === 402) {
        notify.error(getInsufficientCreditsMessage(genData));
        return;
      }
      if (!genRes.ok) throw new Error(genData.message || genData.error || "Не удалось создать запрос");

      if (typeof genData.creditsRemaining === "number") {
        notifyCreditsUpdated(genData.creditsRemaining);
      }

      if (genData.phase === "creative" || genData.phase === "catalog") {
        const isCatalog = genData.phase === "catalog";
        const requestId = genData.requestId as string;
        setDraftRequestId(requestId);
        setGenerationInput(requestId, input);

        setAgentLoadingStatus({
          progress: 6,
          label: "Подготавливаем запрос…",
          sublabel: isCatalog ? "Сохраняем бриф для подбора из каталога" : "Сохраняем бриф и логотип",
        });

        agentStartedAtRef.current = Date.now();
        const syncAgentStatus = (run: Awaited<ReturnType<typeof getAgentRun>> | null) => {
          const elapsed = agentStartedAtRef.current
            ? Date.now() - agentStartedAtRef.current
            : 0;
          setAgentLoadingStatus(getAgentDiscoveryStatus(run, elapsed, isCatalog ? "catalog" : "creative"));
        };

        syncAgentStatus(null);
        try {
          await startAgentRun(requestId, isCatalog ? "catalog" : "creative");
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (!msg.includes("уже выполняется")) throw e;
        }

        const agentRun = await pollAgentRunUntilReady(requestId, syncAgentStatus);
        const agentConcepts = parseAgentConceptsFromRun(agentRun) as AgentConcept[];
        if (!agentConcepts.length) {
          throw new Error("Не удалось подобрать концепции — попробуйте ещё раз");
        }

        const mapped = isCatalog
          ? mapCatalogConceptsToGenerated(agentConcepts, requestId)
          : mapAgentConceptsToGenerated(agentConcepts, requestId, input.colors);

        const projectTitle = buildProjectTitle({
          description: input.description,
          category: input.category,
          quantity: input.quantity,
          createdAt: new Date().toISOString(),
        });

        const project: ProjectSummary = {
          title: projectTitle,
          category: input.category,
          budget: input.budget,
          quantity: input.quantity,
          createdAt: new Date().toISOString(),
          ...genData.project,
          id: requestId,
          requestId,
          conceptsCount: mapped.concepts.length,
          status: "concepts",
          generationMode: isCatalog ? "catalog" : "creative",
          briefExcerpt: input.description.slice(0, 160),
          updatedAt: new Date().toISOString(),
        };

        upsertProject(project);
        setConcepts(mapped.concepts, requestId);
        mergeConceptRenderSessions(mapped.sessions);
        router.push("/concepts/results");
        return;
      }

      throw new Error("Неизвестный ответ сервера");
    } catch (e) {
      console.error(e);
      notify.error(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setIsGenerating(false);
      setAgentLoadingStatus(null);
      agentStartedAtRef.current = null;
    }
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">AI Генерация</h1>
        <AnimatePresence mode="wait">
          <motion.p
            key={generationMode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-2 max-w-2xl text-muted-foreground leading-relaxed"
          >
            {GENERATION_MODE_DESCRIPTIONS[generationMode]}
          </motion.p>
        </AnimatePresence>
      </motion.div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-12">
          <GenerationModeSwitcher mode={generationMode} onChange={handleModeChange} />
          <GenerationForm
            generationMode={generationMode}
            onGenerate={handleGenerate}
            draftRequestId={draftRequestId}
            onDraftRequestId={setDraftRequestId}
            agentLoadingStatus={agentLoadingStatus}
          />
        </div>
        <div className="hidden min-w-0 lg:block">
          <ProjectSidebar />
        </div>
      </div>

      <div className="lg:hidden">
        <ProjectSidebar />
      </div>
    </div>
  );
}
