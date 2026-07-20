"use client";

import { useEffect, useState, useCallback } from "react";
import { assetUrl } from "@/lib/asset-url";
import { notify } from "@/lib/notify";
import { useProjectStore, type ForeignProjectBundle } from "@/store/project-store";
import type { WorkspacePayload } from "@/lib/workspace-types";
import type { ProjectSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  createdAt: string;
  updatedAt: string | null;
  counts: {
    projects: number;
    concepts: number;
    visualizations: number;
    presentations: number;
    files: number;
  };
}

function img(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return assetUrl(url);
  } catch {
    return url;
  }
}

/** Собирает всё, что относится к одному проекту (инвариант id === requestId). */
function gatherProject(payload: WorkspacePayload, project: ProjectSummary): ForeignProjectBundle {
  const K = project.id;
  const requestId = project.requestId ?? project.id;
  const concepts = payload.projectConcepts?.[K] ?? [];
  const conceptIds = new Set(concepts.map((c) => c.id).filter(Boolean) as string[]);
  const generationInput = payload.generationInputs?.[requestId];
  const sessions: ForeignProjectBundle["sessions"] = {};
  for (const c of concepts) {
    if (!c.id) continue;
    const s = payload.conceptRenderSessions?.[c.id];
    if (s) sessions[c.id] = s;
  }
  const visualizations = (payload.visualizations ?? []).filter(
    (v) => conceptIds.has(v.conceptId) || v.projectId === K,
  );
  const vizIds = new Set(visualizations.map((v) => v.id));
  const presentations = (payload.presentations ?? []).filter(
    (pr) => pr.projectId === K || (pr.visualizationIds ?? []).some((id) => vizIds.has(id)),
  );
  return { project, concepts, generationInput, sessions, visualizations, presentations };
}

export default function UsersExplorerPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const importForeignProject = useProjectStore((s) => s.importForeignProject);

  useEffect(() => {
    void fetch("/api/admin/workspaces")
      .then(async (r) => {
        if (!r.ok) {
          setError(r.status === 403 ? "Доступ только для администратора" : `Ошибка ${r.status}`);
          return;
        }
        const data = await r.json();
        setUsers(data.users ?? []);
      })
      .catch(() => setError("Не удалось загрузить пользователей"));
  }, []);

  const openUser = useCallback((u: UserRow) => {
    setSelected(u);
    setPayload(null);
    setLoadingDetail(true);
    void fetch(`/api/admin/workspaces/${u.id}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setPayload((d?.payload ?? null) as WorkspacePayload | null))
      .finally(() => setLoadingDetail(false));
  }, []);

  const copyProject = useCallback(
    (project: ProjectSummary) => {
      if (!payload || !selected) return;
      const bundle = gatherProject(payload, project);
      importForeignProject(bundle, { copiedFromEmail: selected.email });
      notify.success(`Проект «${project.title}» скопирован в «Мои проекты»`);
    },
    [payload, selected, importForeignProject],
  );

  if (error) return <div className="p-8 text-sm text-red-500">{error}</div>;

  const projects = payload?.projects ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-2">
        <h1 className="mb-3 text-lg font-semibold">Пользователи</h1>
        {!users && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {users?.map((u) => (
          <button
            key={u.id}
            onClick={() => openUser(u)}
            className={`w-full rounded-lg border p-3 text-left text-sm transition ${
              selected?.id === u.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{u.email}</span>
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {u.role}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {u.counts.projects} проектов · {u.counts.visualizations} виз · {u.counts.presentations} КП
            </div>
          </button>
        ))}
      </aside>

      <main className="min-w-0 space-y-6">
        {!selected && <p className="text-sm text-muted-foreground">Выберите пользователя слева.</p>}
        {loadingDetail && <p className="text-sm text-muted-foreground">Загрузка воркспейса…</p>}
        {payload && selected && (
          <>
            <div className="text-sm text-muted-foreground">
              Аккаунт <span className="font-medium text-foreground">{selected.email}</span> ·{" "}
              {projects.length} проектов
            </div>
            {projects.length === 0 && <p className="text-sm text-muted-foreground">Нет проектов.</p>}
            {projects.map((project) => {
              const b = gatherProject(payload, project);
              const brief = b.generationInput;
              return (
                <section key={project.id} className="rounded-xl border border-border p-4">
                  <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{project.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {project.category} · {formatCurrency(project.setTotalCost ?? project.budget)} ·{" "}
                        {project.quantity} шт · {project.status}
                      </p>
                    </div>
                    <button
                      onClick={() => copyProject(project)}
                      className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Скопировать себе
                    </button>
                  </header>

                  {brief && (
                    <div className="mb-4 rounded-lg bg-secondary/30 p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Бриф</div>
                      {brief.description && <p className="whitespace-pre-wrap">{brief.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Бюджет набора: {formatCurrency(brief.budget)}</span>
                        <span>Тираж: {brief.quantity}</span>
                        {brief.colors?.length ? <span>Цвета: {brief.colors.join(", ")}</span> : null}
                        {brief.allowedItems?.length ? <span>Разрешено: {brief.allowedItems.join(", ")}</span> : null}
                        {brief.excludedItems?.length ? <span>Запрещено: {brief.excludedItems.join(", ")}</span> : null}
                      </div>
                    </div>
                  )}

                  {b.concepts.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        Концепции / наборы ({b.concepts.length})
                      </div>
                      <div className="space-y-3">
                        {b.concepts.map((c) => (
                          <div key={c.id} className="rounded-lg border border-border p-3">
                            <div className="text-sm font-medium">{c.name}</div>
                            {c.description && (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{c.description}</p>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                              {(c.items ?? []).map((it, i) => (
                                <div key={i} className="rounded border border-border p-1.5 text-[11px]">
                                  {img(it.imageUrl) && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={img(it.imageUrl)} alt="" className="mb-1 aspect-square w-full rounded object-contain bg-secondary/30" />
                                  )}
                                  <div className="truncate font-medium">{it.name}</div>
                                  <div className="text-muted-foreground">{formatCurrency(it.price)}</div>
                                  {it.sourceUrl && (
                                    <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                                      поставщик
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.visualizations.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        Визуализации ({b.visualizations.length})
                      </div>
                      <div className="space-y-3">
                        {b.visualizations.map((v) => (
                          <div key={v.id}>
                            <div className="text-xs text-muted-foreground">{v.conceptName}</div>
                            <div className="mt-1 flex gap-2 overflow-x-auto">
                              {(v.variants?.length ? v.variants : [{ id: v.id, imageUrl: v.imageUrl, refinementBrief: null }]).map(
                                (vr, i) => (
                                  <figure key={i} className="w-40 shrink-0">
                                    {img(vr.imageUrl) && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={img(vr.imageUrl)} alt="" className="aspect-square w-full rounded-lg border border-border object-cover" />
                                    )}
                                    {vr.refinementBrief && (
                                      <figcaption className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                        правка: {vr.refinementBrief}
                                      </figcaption>
                                    )}
                                  </figure>
                                ),
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.presentations.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        Презентации ({b.presentations.length})
                      </div>
                      <ul className="space-y-1 text-sm">
                        {b.presentations.map((pr) => (
                          <li key={pr.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                            <span className="truncate">
                              {pr.title}{" "}
                              <span className="text-xs text-muted-foreground">
                                · {pr.slideCount ?? 0} слайдов · {pr.status}
                              </span>
                            </span>
                            {pr.htmlUrl && (
                              <a href={img(pr.htmlUrl)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary underline">
                                открыть
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
