"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GeneratedConcept,
  ProjectFormData,
  ProjectSummary,
  DashboardStats,
  UploadedFile,
  BudgetMode,
  TaskTemplate,
  ConceptVisualization,
  ConceptItem,
} from "@/lib/types";
import type { ConceptGenerationInput } from "@/lib/generation-payload";
import type { ParsedBriefResponse } from "@/lib/brief-autofill";
import type { WorkspacePayload } from "@/lib/workspace-types";
import { applyParsedBrief } from "@/lib/brief-autofill";
import { clampInt, LIMITS } from "@/lib/sanitize-int";
import { normalizeGeneratedConceptImages } from "@/lib/product-image";
import {
  createDefaultBrandPalette,
  type BrandPaletteSettings,
  type BlacklistItem,
  type GeneratedPresentation,
  type BrandStyle,
} from "@/lib/brand-palette";
import { enrichProjectTitleIfGeneric } from "@/lib/project-title";
import { buildCatalogSetConceptPatch, catalogSetProductIds } from "@/lib/catalog-set-sync";

interface ProjectState {
  formData: ProjectFormData;
  concepts: GeneratedConcept[];
  projectConcepts: Record<string, GeneratedConcept[]>;
  favoriteProjectIds: string[];
  visualizations: ConceptVisualization[];
  customTemplates: TaskTemplate[];
  projects: ProjectSummary[];
  currentProjectId: string | null;
  conceptRenderSessions: Record<string, import("@/lib/types").ConceptRenderSession>;
  generationInputs: Record<string, ConceptGenerationInput>;
  isGenerating: boolean;
  stats: DashboardStats;
  /** ID пользователя, которому принадлежит закэшированный воркспейс. Смена → сброс кэша. */
  ownerUserId: string | null;

  setFormField: <K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) => void;
  applyFormData: (patch: Partial<ProjectFormData>) => void;
  setQuantity: (quantity: number) => void;
  setBudgetMode: (mode: BudgetMode) => void;
  setBudgetPerUnit: (value: number) => void;
  setTotalBudget: (value: number) => void;
  addFile: (file: UploadedFile) => void;
  removeFile: (id: string) => void;
  addColor: (color: string) => void;
  removeColor: (color: string) => void;
  toggleAllowedItem: (item: string) => void;
  toggleExcludedItem: (item: string) => void;
  addAllowedItem: (item: string) => void;
  addExcludedItem: (item: string) => void;
  setSelectedProductIds: (ids: string[]) => void;
  applyBriefParse: (parsed: ParsedBriefResponse) => void;
  setConcepts: (concepts: GeneratedConcept[], projectId: string) => void;
  loadProjectConcepts: (projectId: string) => void;
  getAllStoredConcepts: () => GeneratedConcept[];
  setIsGenerating: (value: boolean) => void;
  addProject: (project: ProjectSummary) => void;
  upsertProject: (project: ProjectSummary) => void;
  updateProject: (projectId: string, patch: Partial<ProjectSummary>) => void;
  deleteProject: (projectId: string) => void;
  resetForm: () => void;
  toggleFavoriteProject: (projectId: string) => void;
  isFavoriteProject: (projectId: string) => boolean;
  getConceptById: (conceptId: string) => GeneratedConcept | undefined;
  patchConcept: (conceptId: string, patch: Partial<GeneratedConcept>) => void;
  syncConceptCatalogSet: (conceptId: string, items: ConceptItem[]) => void;
  getVisualizationByConceptId: (conceptId: string) => ConceptVisualization | undefined;
  mergeConceptRenderSessions: (sessions: Record<string, import("@/lib/types").ConceptRenderSession>) => void;
  setGenerationInput: (requestId: string, input: ConceptGenerationInput) => void;
  patchGenerationInput: (requestId: string, patch: Partial<ConceptGenerationInput>) => void;
  getGenerationInput: (requestId: string) => ConceptGenerationInput | undefined;
  getConceptRenderSession: (conceptId: string) => import("@/lib/types").ConceptRenderSession | undefined;
  addVisualization: (data: {
    conceptId: string;
    conceptName: string;
    imageUrl: string;
    projectId?: string;
    variants?: import("@/lib/types").ConceptVisualizationVariant[];
    activeVariantIndex?: number;
    generatedProductIds?: string[];
    chosenIdeaTitle?: string;
    generationRevision?: number;
    sourceImagePath?: string;
  }) => void;
  clearVisualization: (conceptId: string) => void;
  setVisualizationVariants: (
    conceptId: string,
    variants: import("@/lib/types").ConceptVisualizationVariant[],
    activeVariantIndex?: number,
  ) => void;
  addCustomTemplate: (template: Omit<TaskTemplate, "id" | "isSystem" | "createdAt">) => void;
  deleteCustomTemplate: (templateId: string) => void;
  applyTemplate: (template: TaskTemplate) => void;
  brandLibrary: UploadedFile[];
  brandPalette: BrandPaletteSettings;
  blacklistItems: BlacklistItem[];
  presentations: GeneratedPresentation[];
  addBrandFile: (file: UploadedFile, options?: { select?: boolean }) => void;
  selectBrandFile: (fileId: string) => void;
  clearFormBrandFile: (type: "LOGO" | "BRANDBOOK") => void;
  deleteBrandAsset: (fileId: string) => void;
  applyDetectedBrandPalette: (colors: string[], style: BrandStyle, source: "LOGO" | "BRANDBOOK") => void;
  applyBrandColorsFromAssets: () => void;
  setBrandColorAt: (index: number, color: string) => void;
  resetBrandColors: () => void;
  setBlacklistItems: (items: BlacklistItem[]) => void;
  addBlacklistItemLocal: (item: BlacklistItem) => void;
  removeBlacklistItemLocal: (id: string) => void;
  addPresentation: (presentation: GeneratedPresentation) => void;
  updatePresentation: (id: string, patch: Partial<GeneratedPresentation>) => void;
  hydrateFromServer: (payload: WorkspacePayload) => void;
  exportWorkspacePayload: () => WorkspacePayload;
  /** Полный сброс воркспейса к дефолтам (смена аккаунта/логаут). Ставит владельца. */
  resetWorkspace: (userId: string | null) => void;
  /** Импорт чужого проекта целиком (админ-обзор): новые id, полная изоляция, бейдж. */
  importForeignProject: (
    bundle: ForeignProjectBundle,
    meta: { copiedFromEmail: string },
  ) => void;
}

/** Срез воркспейса, относящийся к ОДНОМУ проекту — для копирования. */
export interface ForeignProjectBundle {
  project: ProjectSummary;
  concepts: GeneratedConcept[];
  generationInput?: ConceptGenerationInput;
  sessions: Record<string, import("@/lib/types").ConceptRenderSession>;
  visualizations: ConceptVisualization[];
  presentations: GeneratedPresentation[];
}

function upsertFormBrandFile(files: UploadedFile[], file: UploadedFile): UploadedFile[] {
  if (file.fileType === "LOGO" || file.fileType === "BRANDBOOK") {
    return [...files.filter((f) => f.fileType !== file.fileType), file];
  }
  return [...files, file];
}

function resolveFormBrandFiles(
  formData: ProjectFormData,
  brandLibrary: UploadedFile[],
): UploadedFile[] {
  const files: UploadedFile[] = [];
  const logoId = formData.selectedLogoId;
  const brandbookId = formData.selectedBrandbookId;
  if (logoId) {
    const logo = brandLibrary.find((f) => f.id === logoId && f.fileType === "LOGO");
    if (logo) files.push(logo);
  }
  if (brandbookId) {
    const bb = brandLibrary.find((f) => f.id === brandbookId && f.fileType === "BRANDBOOK");
    if (bb) files.push(bb);
  }
  return files.length > 0 ? files : formData.files;
}

const defaultFormData: ProjectFormData = {
  description: "",
  generationMode: "catalog",
  categoryPreset: "WELCOME_PACK",
  categoryCustom: "",
  budget: 3000,
  totalBudget: 300000,
  budgetMode: "per_unit",
  quantity: 100,
  setItemCount: 4,
  useProductCountLimit: true,
  giftBoxEnabled: true,
  minProductsPerSet: 3,
  maxProductsPerSet: 5,
  conceptCount: 5,
  visualizationCount: 1,
  colors: [],
  allowedItems: [],
  excludedItems: [],
  files: [],
  selectedProductIds: [],
  selectedLogoId: undefined,
  selectedBrandbookId: undefined,
};

const defaultStats: DashboardStats = {
  totalProjects: 0,
  totalConcepts: 0,
  averageBudget: 0,
  creditsUsed: 0,
  creditsRemaining: 0,
};

/**
 * Бюджет НА НАБОР (`budget`) — единственный источник истины для подбора.
 * `totalBudget` = «бюджет на закупку» = Тираж × бюджет_набора — СПРАВОЧНАЯ величина,
 * не влияет на подбор и НЕ пересчитывает per-set при смене тиража.
 */
function syncBudget(
  data: ProjectFormData,
  field: "budget" | "totalBudget" | "quantity",
  value: number
): Pick<ProjectFormData, "budget" | "totalBudget" | "quantity"> {
  const quantity =
    field === "quantity"
      ? clampInt(value, LIMITS.quantity)
      : clampInt(data.quantity, LIMITS.quantity);

  // Явное редактирование «общего бюджета» (если поле где-то доступно) → обратный пересчёт
  // per-set. В обычном потоке это поле только для чтения, так что путь почти не используется.
  if (field === "totalBudget") {
    const totalBudget = Math.max(0, Math.round(value));
    return {
      quantity,
      totalBudget,
      budget: clampInt(Math.round(totalBudget / Math.max(1, quantity)), LIMITS.budget),
    };
  }

  // field === 'budget' | 'quantity': per-set фиксируем, общий = per-set × тираж (без клампа
  // per-set-лимитами — это справочная сумма, может быть больше потолка одного набора).
  const perUnit = clampInt(field === "budget" ? value : data.budget, LIMITS.budget);
  return {
    quantity,
    budget: perUnit,
    totalBudget: Math.max(0, perUnit * quantity),
  };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      formData: defaultFormData,
      concepts: [],
      projectConcepts: {},
      favoriteProjectIds: [],
      visualizations: [],
      customTemplates: [],
      projects: [],
      currentProjectId: null,
      conceptRenderSessions: {},
      generationInputs: {},
      isGenerating: false,
      stats: defaultStats,
      brandLibrary: [],
      ownerUserId: null,

      setFormField: (key, value) =>
        set((state) => ({
          formData: { ...state.formData, [key]: value },
        })),

      applyFormData: (patch) =>
        set((state) => ({
          formData: { ...state.formData, ...patch },
        })),

      setQuantity: (quantity) =>
        set((state) => ({
          formData: { ...state.formData, ...syncBudget(state.formData, "quantity", quantity) },
        })),

      setBudgetMode: (mode) =>
        set((state) => ({
          formData: { ...state.formData, budgetMode: mode },
        })),

      setBudgetPerUnit: (value) =>
        set((state) => ({
          formData: { ...state.formData, ...syncBudget(state.formData, "budget", value) },
        })),

      setTotalBudget: (value) =>
        set((state) => ({
          formData: { ...state.formData, ...syncBudget(state.formData, "totalBudget", value) },
        })),

      addFile: (file) =>
        set((state) => ({
          formData: {
            ...state.formData,
            files: [...state.formData.files, file],
          },
        })),

      removeFile: (id) =>
        set((state) => ({
          formData: {
            ...state.formData,
            files: state.formData.files.filter((f) => f.id !== id),
          },
        })),

      addColor: (color) =>
        set((state) => {
          if (state.formData.colors.includes(color)) return state;
          const colors = [...state.formData.colors, color];
          return {
            formData: {
              ...state.formData,
              colors,
            },
            brandPalette: {
              ...state.brandPalette,
              activeColors: colors,
              manualOverride: true,
            },
          };
        }),

      removeColor: (color) =>
        set((state) => {
          const normalized = color.toUpperCase();
          const colors = state.formData.colors.filter((c) => c.toUpperCase() !== normalized);
          return {
            formData: {
              ...state.formData,
              colors,
            },
            brandPalette: {
              ...state.brandPalette,
              activeColors: colors,
              manualOverride: true,
            },
          };
        }),

      toggleAllowedItem: (item) =>
        set((state) => {
          const items = state.formData.allowedItems;
          return {
            formData: {
              ...state.formData,
              allowedItems: items.includes(item)
                ? items.filter((i) => i !== item)
                : [...items, item],
            },
          };
        }),

      toggleExcludedItem: (item) =>
        set((state) => {
          const items = state.formData.excludedItems;
          return {
            formData: {
              ...state.formData,
              excludedItems: items.includes(item)
                ? items.filter((i) => i !== item)
                : [...items, item],
            },
          };
        }),

      addAllowedItem: (item) =>
        set((state) => {
          const trimmed = item.trim();
          if (!trimmed || state.formData.allowedItems.includes(trimmed)) return state;
          return {
            formData: {
              ...state.formData,
              allowedItems: [...state.formData.allowedItems, trimmed],
            },
          };
        }),

      addExcludedItem: (item) =>
        set((state) => {
          const trimmed = item.trim();
          if (!trimmed || state.formData.excludedItems.includes(trimmed)) return state;
          return {
            formData: {
              ...state.formData,
              excludedItems: [...state.formData.excludedItems, trimmed],
            },
          };
        }),

      setSelectedProductIds: (ids) =>
        set((state) => ({
          formData: { ...state.formData, selectedProductIds: ids },
        })),

      applyBriefParse: (parsed) =>
        set((state) => ({
          formData: applyParsedBrief(state.formData, parsed),
        })),

      setConcepts: (concepts, projectId) =>
        set((state) => {
          const isUpdate = Boolean(state.projectConcepts[projectId]?.length);
          return {
            concepts,
            projectConcepts: { ...state.projectConcepts, [projectId]: concepts },
            currentProjectId: projectId,
            stats: {
              ...state.stats,
              totalConcepts: isUpdate
                ? state.stats.totalConcepts
                : state.stats.totalConcepts + concepts.length,
            },
          };
        }),

      loadProjectConcepts: (projectId) =>
        set((state) => {
          const concepts = state.projectConcepts[projectId] ?? [];
          const sessionPatch: Record<string, import("@/lib/types").ConceptRenderSession> = {};
          for (const c of concepts) {
            if (!state.conceptRenderSessions[c.id ?? ""]) {
              sessionPatch[c.id ?? ""] = {
                requestId: projectId,
                projectId,
                chosenIdeaTitle: c.name,
              };
            }
          }
          return {
            concepts,
            currentProjectId: projectId,
            conceptRenderSessions:
              Object.keys(sessionPatch).length > 0
                ? { ...state.conceptRenderSessions, ...sessionPatch }
                : state.conceptRenderSessions,
          };
        }),

      getAllStoredConcepts: () => {
        const state = get();
        const seen = new Set<string>();
        const all: GeneratedConcept[] = [];
        for (const list of Object.values(state.projectConcepts)) {
          for (const c of list) {
            if (c.id && !seen.has(c.id)) {
              seen.add(c.id);
              all.push(c);
            }
          }
        }
        for (const c of state.concepts) {
          if (c.id && !seen.has(c.id)) {
            seen.add(c.id);
            all.push(c);
          }
        }
        return all;
      },

      setIsGenerating: (value) => set({ isGenerating: value }),

      addProject: (project) =>
        set((state) => {
          const projects = [project, ...state.projects];
          const avgBudget =
            projects.reduce((sum, p) => sum + p.budget, 0) / projects.length;
          return {
            projects,
            currentProjectId: project.id,
            stats: {
              ...state.stats,
              totalProjects: projects.length,
              averageBudget: Math.round(avgBudget),
            },
          };
        }),

      upsertProject: (project) =>
        set((state) => {
          const idx = state.projects.findIndex((p) => p.id === project.id);
          const existing = idx >= 0 ? state.projects[idx] : null;
          const merged: ProjectSummary = {
            ...project,
            createdAt: existing?.createdAt ?? project.createdAt,
            updatedAt: project.updatedAt ?? new Date().toISOString(),
          };
          const projects =
            idx >= 0
              ? state.projects.map((p, i) => (i === idx ? merged : p))
              : [merged, ...state.projects];
          const avgBudget =
            projects.reduce((sum, p) => sum + p.budget, 0) / projects.length;
          return {
            projects,
            currentProjectId: merged.id,
            stats: {
              ...state.stats,
              totalProjects: projects.length,
              averageBudget: Math.round(avgBudget),
            },
          };
        }),

      updateProject: (projectId, patch) =>
        set((state) => {
          const projects = state.projects.map((p) =>
            p.id === projectId
              ? { ...p, ...patch, updatedAt: new Date().toISOString() }
              : p,
          );
          return { projects };
        }),

      deleteProject: (projectId) =>
        set((state) => {
          const projects = state.projects.filter((p) => p.id !== projectId);
          const { [projectId]: _, ...projectConcepts } = state.projectConcepts;
          const avgBudget =
            projects.length > 0
              ? projects.reduce((sum, p) => sum + p.budget, 0) / projects.length
              : 0;
          const conceptIds = new Set(
            (state.projectConcepts[projectId] ?? []).map((c) => c.id).filter(Boolean)
          );
          return {
            projects,
            projectConcepts,
            favoriteProjectIds: state.favoriteProjectIds.filter((id) => id !== projectId),
            visualizations: state.visualizations.filter(
              (v) => !conceptIds.has(v.conceptId) && v.projectId !== projectId
            ),
            currentProjectId:
              state.currentProjectId === projectId ? null : state.currentProjectId,
            concepts:
              state.currentProjectId === projectId ? [] : state.concepts,
            stats: {
              ...state.stats,
              totalProjects: projects.length,
              averageBudget: Math.round(avgBudget),
            },
          };
        }),

      resetForm: () =>
        set({
          formData: defaultFormData,
          concepts: [],
          currentProjectId: null,
        }),

      isFavoriteProject: (projectId) =>
        get().favoriteProjectIds.includes(projectId),

      toggleFavoriteProject: (projectId) =>
        set((state) => {
          const exists = state.favoriteProjectIds.includes(projectId);
          return {
            favoriteProjectIds: exists
              ? state.favoriteProjectIds.filter((id) => id !== projectId)
              : [...state.favoriteProjectIds, projectId],
          };
        }),

      getConceptById: (conceptId) => {
        const state = get();
        const fromCurrent = state.concepts.find((c) => c.id === conceptId);
        if (fromCurrent) return fromCurrent;
        for (const list of Object.values(state.projectConcepts)) {
          const found = list.find((c) => c.id === conceptId);
          if (found) return found;
        }
        return undefined;
      },

      patchConcept: (conceptId, patch) =>
        set((state) => {
          const patchOne = (c: GeneratedConcept) =>
            c.id === conceptId ? { ...c, ...patch } : c;

          const concepts = state.concepts.map(patchOne);
          const projectConcepts = { ...state.projectConcepts };
          for (const [pid, list] of Object.entries(projectConcepts)) {
            if (list.some((c) => c.id === conceptId)) {
              projectConcepts[pid] = list.map(patchOne);
            }
          }
          return { concepts, projectConcepts };
        }),

      syncConceptCatalogSet: (conceptId, items) =>
        set((state) => {
          const hadViz = Boolean(state.visualizations.find((v) => v.conceptId === conceptId));
          const conceptPatch = buildCatalogSetConceptPatch(items, {
            markVisualizationOutdated: hadViz,
          });
          const totalCost = conceptPatch.totalCost ?? 0;
          const productIds = catalogSetProductIds(items);

          const patchOne = (c: GeneratedConcept) =>
            c.id === conceptId ? { ...c, ...conceptPatch } : c;

          const concepts = state.concepts.map(patchOne);
          const projectConcepts = { ...state.projectConcepts };
          for (const [pid, list] of Object.entries(projectConcepts)) {
            if (list.some((c) => c.id === conceptId)) {
              projectConcepts[pid] = list.map(patchOne);
            }
          }

          const session = state.conceptRenderSessions[conceptId];
          const requestId = session?.requestId ?? session?.projectId;
          const projectId = session?.projectId ?? requestId;

          let generationInputs = state.generationInputs;
          if (requestId && generationInputs[requestId]) {
            generationInputs = {
              ...generationInputs,
              [requestId]: {
                ...generationInputs[requestId],
                setItemCount: items.length,
                selectedProductIds: productIds,
              },
            };
          }

          let projects = state.projects;
          let formData = state.formData;
          if (projectId) {
            const now = new Date().toISOString();
            projects = projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    updatedAt: now,
                    ...(totalCost > 0 ? { setTotalCost: totalCost } : { setTotalCost: undefined }),
                  }
                : p,
            );
            if (state.currentProjectId === projectId) {
              formData = {
                ...formData,
                setItemCount: items.length,
                selectedProductIds: productIds,
              };
            }
          }

          return { concepts, projectConcepts, generationInputs, projects, formData };
        }),

      getVisualizationByConceptId: (conceptId) =>
        get().visualizations.find((v) => v.conceptId === conceptId),

      mergeConceptRenderSessions: (sessions) =>
        set((state) => ({
          conceptRenderSessions: { ...state.conceptRenderSessions, ...sessions },
        })),

      setGenerationInput: (requestId, input) =>
        set((state) => ({
          generationInputs: { ...state.generationInputs, [requestId]: input },
        })),

      patchGenerationInput: (requestId, patch) =>
        set((state) => {
          const existing = state.generationInputs[requestId];
          if (!existing) return state;
          return {
            generationInputs: {
              ...state.generationInputs,
              [requestId]: { ...existing, ...patch },
            },
          };
        }),

      getGenerationInput: (requestId) => get().generationInputs[requestId],

      getConceptRenderSession: (conceptId) => get().conceptRenderSessions[conceptId],

      addVisualization: ({
        conceptId,
        conceptName,
        imageUrl,
        projectId,
        variants,
        activeVariantIndex,
        generatedProductIds,
        chosenIdeaTitle,
        generationRevision,
        sourceImagePath,
      }) =>
        set((state) => {
          const existing = state.visualizations.find((v) => v.conceptId === conceptId);
          const visualization: ConceptVisualization = {
            id: existing?.id ?? `viz-${Date.now()}`,
            conceptId,
            conceptName,
            imageUrl,
            projectId: projectId ?? state.currentProjectId ?? undefined,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            variants: variants ?? existing?.variants,
            activeVariantIndex: activeVariantIndex ?? (variants?.length ? variants.length - 1 : 0),
            generatedProductIds: generatedProductIds ?? existing?.generatedProductIds,
            chosenIdeaTitle: chosenIdeaTitle ?? existing?.chosenIdeaTitle,
            generationRevision: generationRevision ?? existing?.generationRevision,
            sourceImagePath: sourceImagePath ?? existing?.sourceImagePath,
          };
          const visualizations = [
            visualization,
            ...state.visualizations.filter((v) => v.conceptId !== conceptId),
          ];
          return {
            visualizations,
            stats: {
              ...state.stats,
            },
          };
        }),

      clearVisualization: (conceptId) =>
        set((state) => ({
          visualizations: state.visualizations.filter((v) => v.conceptId !== conceptId),
        })),

      setVisualizationVariants: (conceptId, variants, activeVariantIndex) =>
        set((state) => {
          const idx = state.visualizations.findIndex((v) => v.conceptId === conceptId);
          if (idx < 0) return state;
          const current = state.visualizations[idx];
          const nextIndex =
            activeVariantIndex ?? Math.max(0, variants.length - 1);
          const active = variants[nextIndex] ?? variants[variants.length - 1];
          const updated: ConceptVisualization = {
            ...current,
            variants,
            activeVariantIndex: nextIndex,
            imageUrl: active?.imageUrl ?? current.imageUrl,
          };
          const visualizations = [...state.visualizations];
          visualizations[idx] = updated;
          return { visualizations };
        }),

      addCustomTemplate: (template) =>
        set((state) => ({
          customTemplates: [
            {
              ...template,
              id: `custom-${Date.now()}`,
              isSystem: false,
              createdAt: new Date().toISOString(),
            },
            ...state.customTemplates,
          ],
        })),

      deleteCustomTemplate: (templateId) =>
        set((state) => ({
          customTemplates: state.customTemplates.filter((t) => t.id !== templateId),
        })),

      applyTemplate: (template) =>
        set((state) => ({
          formData: {
            ...state.formData,
            description: template.description,
            categoryPreset: template.categoryPreset,
            categoryCustom: template.categoryCustom ?? "",
            allowedItems: [...template.allowedItems],
            excludedItems: [...(template.excludedItems ?? [])],
            budgetMode: "per_unit",
            budget: template.budget,
            quantity: template.quantity,
            totalBudget: template.budget * template.quantity,
          },
        })),

      addBrandFile: (file, options) =>
        set((state) => {
          const select = options?.select !== false;
          const brandLibrary = state.brandLibrary.some((f) => f.id === file.id)
            ? state.brandLibrary.map((f) => (f.id === file.id ? { ...f, ...file } : f))
            : [...state.brandLibrary, file];

          if (!select) {
            return { brandLibrary };
          }

          const logoPatch = file.fileType === "LOGO" ? { selectedLogoId: file.id } : {};
          const brandbookPatch =
            file.fileType === "BRANDBOOK" ? { selectedBrandbookId: file.id } : {};
          return {
            brandLibrary,
            formData: {
              ...state.formData,
              ...logoPatch,
              ...brandbookPatch,
              files: upsertFormBrandFile(state.formData.files, file),
            },
          };
        }),

      selectBrandFile: (fileId) =>
        set((state) => {
          const file = state.brandLibrary.find((f) => f.id === fileId);
          if (!file) return state;
          const logoPatch =
            file.fileType === "LOGO" ? { selectedLogoId: file.id } : {};
          const brandbookPatch =
            file.fileType === "BRANDBOOK" ? { selectedBrandbookId: file.id } : {};
          return {
            formData: {
              ...state.formData,
              ...logoPatch,
              ...brandbookPatch,
              files: upsertFormBrandFile(state.formData.files, file),
            },
          };
        }),

      clearFormBrandFile: (type) =>
        set((state) => ({
          formData: {
            ...state.formData,
            files: state.formData.files.filter((f) => f.fileType !== type),
            ...(type === "LOGO" ? { selectedLogoId: undefined } : {}),
            ...(type === "BRANDBOOK" ? { selectedBrandbookId: undefined } : {}),
          },
        })),

      deleteBrandAsset: (fileId) =>
        set((state) => ({
          brandLibrary: state.brandLibrary.filter((f) => f.id !== fileId),
          formData: {
            ...state.formData,
            files: state.formData.files.filter((f) => f.id !== fileId),
            ...(state.formData.selectedLogoId === fileId ? { selectedLogoId: undefined } : {}),
            ...(state.formData.selectedBrandbookId === fileId
              ? { selectedBrandbookId: undefined }
              : {}),
          },
        })),

      brandPalette: createDefaultBrandPalette(),
      blacklistItems: [],
      presentations: [],

      applyDetectedBrandPalette: (colors, style, source) =>
        set((state) => ({
          brandPalette: {
            ...state.brandPalette,
            detectedColors: colors,
            detectedStyle: style,
            lastAnalyzedAt: new Date().toISOString(),
            lastAnalyzedSource: source,
          },
        })),

      applyBrandColorsFromAssets: () =>
        set((state) => {
          const colors = state.brandPalette.detectedColors.slice(0, 8);
          if (colors.length === 0) return state;
          return {
            brandPalette: {
              ...state.brandPalette,
              activeColors: colors,
              activeStyle: state.brandPalette.detectedStyle,
              manualOverride: false,
            },
            formData: {
              ...state.formData,
              colors,
            },
          };
        }),

      setBrandColorAt: (index, color) =>
        set((state) => {
          const activeColors = [...state.brandPalette.activeColors];
          while (activeColors.length <= index) activeColors.push(color);
          activeColors[index] = color;
          return {
            brandPalette: {
              ...state.brandPalette,
              activeColors,
              manualOverride: true,
            },
            formData: {
              ...state.formData,
              colors: activeColors.slice(0, 8),
            },
          };
        }),

      resetBrandColors: () =>
        set((state) => ({
          brandPalette: {
            ...state.brandPalette,
            activeColors: [],
            activeStyle: "neutral",
            manualOverride: false,
          },
          formData: {
            ...state.formData,
            colors: [],
          },
        })),

      setBlacklistItems: (items) => set({ blacklistItems: items }),
      addBlacklistItemLocal: (item) =>
        set((state) => ({
          blacklistItems: [item, ...state.blacklistItems.filter((i) => i.id !== item.id)],
        })),
      removeBlacklistItemLocal: (id) =>
        set((state) => ({
          blacklistItems: state.blacklistItems.filter((i) => i.id !== id),
        })),

      addPresentation: (presentation) =>
        set((state) => ({
          // Идемпотентно по id: убираем существующую запись с тем же id перед вставкой,
          // иначе одна генерация создаёт дубль (оптимистичная вставка + sync из джобы).
          presentations: [
            presentation,
            ...state.presentations.filter((p) => p.id !== presentation.id),
          ],
        })),

      updatePresentation: (id, patch) =>
        set((state) => ({
          presentations: state.presentations.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      resetWorkspace: (userId) =>
        set(() => ({
          formData: defaultFormData,
          concepts: [],
          projectConcepts: {},
          favoriteProjectIds: [],
          visualizations: [],
          customTemplates: [],
          projects: [],
          currentProjectId: null,
          conceptRenderSessions: {},
          generationInputs: {},
          stats: defaultStats,
          brandLibrary: [],
          brandPalette: createDefaultBrandPalette(),
          blacklistItems: [],
          presentations: [],
          ownerUserId: userId,
        })),

      importForeignProject: (bundle, meta) =>
        set((state) => {
          const uid = (prefix: string, i = 0) =>
            `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}`;
          const newProjectId = uid("proj");
          const newRequestId = newProjectId; // инвариант приложения: project.id === requestId

          // Новые id концепций + карта перепривязки.
          const conceptIdMap = new Map<string, string>();
          const newConcepts = (bundle.concepts ?? []).map((c, i) => {
            const nid = uid("concept", i);
            if (c.id) conceptIdMap.set(c.id, nid);
            return { ...c, id: nid };
          });

          // Новые id визуализаций + карта.
          const vizIdMap = new Map<string, string>();
          const newViz = (bundle.visualizations ?? []).map((v, i) => {
            const nid = uid("viz", i);
            vizIdMap.set(v.id, nid);
            return {
              ...v,
              id: nid,
              conceptId: conceptIdMap.get(v.conceptId) ?? v.conceptId,
              projectId: newProjectId,
            };
          });

          // Рендер-сессии: ключ = новый conceptId, внутри requestId/projectId = новые.
          const newSessions: Record<string, import("@/lib/types").ConceptRenderSession> = {};
          for (const [oldCid, sess] of Object.entries(bundle.sessions ?? {})) {
            const nid = conceptIdMap.get(oldCid);
            if (!nid) continue;
            newSessions[nid] = { ...sess, requestId: newRequestId, projectId: newProjectId };
          }

          // Презентации: новые id, перепривязка projectId + visualizationIds.
          const newPresentations = (bundle.presentations ?? []).map((pr, i) => ({
            ...pr,
            id: uid("pres", i),
            projectId: newProjectId,
            visualizationIds: (pr.visualizationIds ?? []).map((id) => vizIdMap.get(id) ?? id),
          }));

          const now = new Date().toISOString();
          const newProject: ProjectSummary = {
            ...bundle.project,
            id: newProjectId,
            requestId: newRequestId,
            conceptsCount: newConcepts.length || bundle.project.conceptsCount,
            isForeignCopy: true,
            copiedFromEmail: meta.copiedFromEmail,
            createdAt: now,
            updatedAt: now,
          };

          const newInput = bundle.generationInput
            ? { ...bundle.generationInput, requestId: newRequestId }
            : undefined;

          return {
            projects: [newProject, ...state.projects],
            projectConcepts: { ...state.projectConcepts, [newRequestId]: newConcepts },
            generationInputs: newInput
              ? { ...state.generationInputs, [newRequestId]: newInput }
              : state.generationInputs,
            conceptRenderSessions: { ...state.conceptRenderSessions, ...newSessions },
            visualizations: [...newViz, ...state.visualizations],
            presentations: [...newPresentations, ...state.presentations],
          };
        }),

      hydrateFromServer: (payload) =>
        set((state) => {
          const generationInputs = payload.generationInputs ?? state.generationInputs;
          const projects = (payload.projects ?? state.projects).map((p) => {
            const requestId = p.requestId ?? p.id;
            const input = generationInputs[requestId];
            return enrichProjectTitleIfGeneric(p, input?.description ?? p.briefExcerpt);
          });
          return {
          projects,
          concepts: payload.concepts ?? state.concepts,
          projectConcepts: payload.projectConcepts ?? state.projectConcepts,
          conceptRenderSessions: payload.conceptRenderSessions ?? state.conceptRenderSessions,
          generationInputs,
          favoriteProjectIds: payload.favoriteProjectIds ?? state.favoriteProjectIds,
          visualizations: payload.visualizations ?? state.visualizations,
          customTemplates: payload.customTemplates ?? state.customTemplates,
          stats: payload.stats ?? state.stats,
          currentProjectId: payload.currentProjectId ?? state.currentProjectId,
          brandLibrary: payload.brandLibrary ?? state.brandLibrary,
          brandPalette: payload.brandPalette ?? state.brandPalette,
          blacklistItems: payload.blacklistItems ?? state.blacklistItems,
          presentations: payload.presentations ?? state.presentations,
          formData: {
            ...state.formData,
            ...payload.formData,
            files: resolveFormBrandFiles(
              { ...state.formData, ...payload.formData },
              payload.brandLibrary ?? state.brandLibrary,
            ),
          },
        };
        }),

      exportWorkspacePayload: () => {
        const state = get();
        return {
          projects: state.projects,
          concepts: state.concepts,
          projectConcepts: state.projectConcepts,
          conceptRenderSessions: state.conceptRenderSessions,
          generationInputs: state.generationInputs,
          favoriteProjectIds: state.favoriteProjectIds,
          visualizations: state.visualizations,
          customTemplates: state.customTemplates,
          stats: state.stats,
          currentProjectId: state.currentProjectId,
          brandLibrary: state.brandLibrary,
          brandPalette: state.brandPalette,
          blacklistItems: state.blacklistItems,
          presentations: state.presentations,
          formData: {
            generationMode: state.formData.generationMode,
            selectedLogoId: state.formData.selectedLogoId,
            selectedBrandbookId: state.formData.selectedBrandbookId,
            useProductCountLimit: state.formData.useProductCountLimit,
            giftBoxEnabled: state.formData.giftBoxEnabled,
            minProductsPerSet: state.formData.minProductsPerSet,
            maxProductsPerSet: state.formData.maxProductsPerSet,
            conceptCount: state.formData.conceptCount,
            visualizationCount: state.formData.visualizationCount,
            allowedItems: state.formData.allowedItems,
            excludedItems: state.formData.excludedItems,
            setItemCount: state.formData.setItemCount,
            description: state.formData.description,
            categoryPreset: state.formData.categoryPreset,
            categoryCustom: state.formData.categoryCustom,
            budget: state.formData.budget,
            totalBudget: state.formData.totalBudget,
            budgetMode: state.formData.budgetMode,
            quantity: state.formData.quantity,
            colors: state.formData.colors,
            selectedProductIds: state.formData.selectedProductIds,
          },
        };
      },
    }),
    {
      name: "ult-concept-ai-storage",
      merge: (persisted, current) => {
        const saved = persisted as Partial<ProjectState> & { _storageVersion?: number } | undefined;
        const version = saved?._storageVersion ?? 0;
        const merged = {
          ...current,
          ...saved,
          formData: {
            ...defaultFormData,
            ...saved?.formData,
            ...current.formData,
            selectedProductIds: [],
          },
          brandLibrary: saved?.brandLibrary ?? current.brandLibrary,
        };
        merged.formData.files = resolveFormBrandFiles(merged.formData, merged.brandLibrary);
        if (version < 4) {
          return {
            ...merged,
            visualizations: [],
            projects: (saved?.projects ?? []).map((p) => ({
              ...p,
              resultImageUrl: undefined,
            })),
            brandPalette: createDefaultBrandPalette(),
            blacklistItems: [],
            presentations: [],
            _storageVersion: 6,
          };
        }
        if (version < 6) {
          const savedPalette = saved?.brandPalette;
          return {
            ...merged,
            formData: {
              ...merged.formData,
              colors: [],
            },
            brandPalette: {
              ...createDefaultBrandPalette(),
              detectedColors: savedPalette?.detectedColors ?? [],
              detectedStyle: savedPalette?.detectedStyle ?? "neutral",
              lastAnalyzedAt: savedPalette?.lastAnalyzedAt,
              lastAnalyzedSource: savedPalette?.lastAnalyzedSource,
            },
            blacklistItems: saved?.blacklistItems ?? [],
            presentations: saved?.presentations ?? [],
            _storageVersion: 7,
          };
        }
        if (version < 7) {
          return {
            ...merged,
            formData: {
              ...merged.formData,
              useProductCountLimit: merged.formData.useProductCountLimit ?? true,
              minProductsPerSet: merged.formData.minProductsPerSet ?? 3,
              maxProductsPerSet: merged.formData.maxProductsPerSet ?? 5,
              conceptCount: merged.formData.conceptCount ?? 5,
              visualizationCount: merged.formData.visualizationCount ?? 1,
            },
            _storageVersion: 7,
          };
        }
        if (version < 8) {
          const concepts = (merged.concepts ?? []).map(normalizeGeneratedConceptImages);
          const projectConcepts = Object.fromEntries(
            Object.entries(merged.projectConcepts ?? {}).map(([id, list]) => [
              id,
              list.map(normalizeGeneratedConceptImages),
            ]),
          );
          return { ...merged, concepts, projectConcepts, _storageVersion: 8 };
        }
        return merged;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const version = (state as ProjectState & { _storageVersion?: number })._storageVersion ?? 0;
        if (version < 4) {
          state.visualizations = [];
          state.projects = state.projects.map((p) => ({
            ...p,
            resultImageUrl: undefined,
          }));
        }
        if (version < 6) {
          const savedPalette = state.brandPalette;
          state.formData.colors = [];
          state.brandPalette = {
            ...createDefaultBrandPalette(),
            detectedColors: savedPalette?.detectedColors ?? [],
            detectedStyle: savedPalette?.detectedStyle ?? "neutral",
            lastAnalyzedAt: savedPalette?.lastAnalyzedAt,
            lastAnalyzedSource: savedPalette?.lastAnalyzedSource,
          };
          (state as ProjectState & { _storageVersion?: number })._storageVersion = 7;
        }
        if (version < 8) {
          state.concepts = state.concepts.map(normalizeGeneratedConceptImages);
          state.projectConcepts = Object.fromEntries(
            Object.entries(state.projectConcepts).map(([id, list]) => [
              id,
              list.map(normalizeGeneratedConceptImages),
            ]),
          );
          (state as ProjectState & { _storageVersion?: number })._storageVersion = 8;
        }
        state.formData.files = resolveFormBrandFiles(state.formData, state.brandLibrary);
        state.projects = state.projects.map((p) => {
          const requestId = p.requestId ?? p.id;
          const input = state.generationInputs[requestId];
          return enrichProjectTitleIfGeneric(p, input?.description ?? p.briefExcerpt);
        });
      },
      partialize: (state) => ({
        projects: state.projects,
        concepts: state.concepts,
        projectConcepts: state.projectConcepts,
        conceptRenderSessions: state.conceptRenderSessions,
        generationInputs: state.generationInputs,
        favoriteProjectIds: state.favoriteProjectIds,
        visualizations: state.visualizations,
        customTemplates: state.customTemplates,
        stats: state.stats,
        currentProjectId: state.currentProjectId,
        brandLibrary: state.brandLibrary,
        brandPalette: state.brandPalette,
        blacklistItems: state.blacklistItems,
        presentations: state.presentations,
        ownerUserId: state.ownerUserId,
        formData: {
          generationMode: state.formData.generationMode,
          selectedLogoId: state.formData.selectedLogoId,
          selectedBrandbookId: state.formData.selectedBrandbookId,
          useProductCountLimit: state.formData.useProductCountLimit,
          giftBoxEnabled: state.formData.giftBoxEnabled,
          minProductsPerSet: state.formData.minProductsPerSet,
          maxProductsPerSet: state.formData.maxProductsPerSet,
          conceptCount: state.formData.conceptCount,
          visualizationCount: state.formData.visualizationCount,
          allowedItems: state.formData.allowedItems,
          excludedItems: state.formData.excludedItems,
          setItemCount: state.formData.setItemCount,
        },
        _storageVersion: 8 as const,
      }),
    }
  )
);
