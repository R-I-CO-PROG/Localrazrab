"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, Network, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MermaidDiagram } from "@/components/admin/logic/mermaid-diagram";
import { CatalogManager } from "@/components/admin/catalog";
import { LOGIC_NAV, methodClass } from "@/lib/logic/nav";
import type {
  LogicDataResponse,
  LogicPanelId,
  LogicPromptCatalogItem,
  LogicPromptEntry,
  LogicPromptStatus,
  LogicSystemData,
} from "@/lib/logic/types";

const PROMPT_STATUS_META: Record<
  LogicPromptStatus,
  { label: string; className: string; description: string }
> = {
  active: {
    label: "Активен",
    className: "border-primary/30 bg-primary/15 text-primary",
    description: "Вызывается в текущем production-потоке",
  },
  conditional: {
    label: "Условно",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-400",
    description: "Только при включённом флаге или режиме",
  },
  fallback: {
    label: "Fallback",
    className: "border-border bg-secondary text-muted-foreground",
    description: "Резерв при сбое основного пути",
  },
  unused: {
    label: "Не используется",
    className: "border-destructive/30 bg-destructive/15 text-destructive line-through decoration-destructive/50",
    description: "Есть в коде, но нет импортов / вызовов",
  },
  deprecated: {
    label: "Устарел",
    className: "border-destructive/30 bg-destructive/15 text-destructive",
    description: "Удалён из pipeline, оставлен в коде",
  },
};

function StatusBadge({ status, note }: { status: LogicPromptStatus; note?: string }) {
  const meta = PROMPT_STATUS_META[status];
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${meta.className}`} title={note ?? meta.description}>
      {meta.label}
    </Badge>
  );
}

export function LogicExplorer() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState<LogicSystemData | null>(null);
  const [prompts, setPrompts] = useState<LogicPromptEntry[]>([]);
  const [promptsGeneratedAt, setPromptsGeneratedAt] = useState("");
  const [panel, setPanel] = useState<LogicPanelId>("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [apiSearch, setApiSearch] = useState("");
  const [promptSearch, setPromptSearch] = useState("");
  const [promptCategory, setPromptCategory] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<LogicPromptCatalogItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/logic");
      if (res.status === 403) {
        setAllowed(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LogicDataResponse;
      setSystem(data.system);
      setPrompts(data.prompts.prompts ?? []);
      setPromptsGeneratedAt(data.prompts.generatedAt ?? "");
      setAllowed(true);
    } catch {
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const promptMap = useMemo(() => {
    const map = new Map<string, LogicPromptEntry>();
    for (const p of prompts) {
      map.set(p.name, p);
      map.set(`${p.file}::${p.name}`, p);
    }
    return map;
  }, [prompts]);

  function getPromptContent(item: LogicPromptCatalogItem): string | null {
    return (
      promptMap.get(item.name)?.content ??
      promptMap.get(`${item.file}::${item.name}`)?.content ??
      null
    );
  }

  function handleGlobalSearch(value: string) {
    setGlobalSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) return;
    if (q.includes("каталог") || q.includes("товар") || q.includes("catalog")) {
      setPanel("catalog");
    } else if (q.includes("prompt") || q.includes("промпт")) {
      setPanel("prompts");
      setPromptSearch(value);
    } else if (q.includes("api") || q.startsWith("get") || q.startsWith("post")) {
      setPanel("api");
      setApiSearch(value);
    } else if (q.includes("кноп") || q.includes("/")) {
      setPanel("pages");
    }
  }

  if (allowed === null || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Загрузка карты логики…
      </div>
    );
  }

  if (!allowed || !system) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Доступ запрещён</CardTitle>
          <CardDescription>Раздел только для администратора.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings">← Настройки</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const filteredPrompts = system.promptCatalog.filter((p) => {
    if (promptCategory && p.category !== promptCategory) return false;
    if (promptStatus && p.status !== promptStatus) return false;
    if (!promptSearch.trim()) return true;
    const q = promptSearch.toLowerCase();
    const content = getPromptContent(p) ?? "";
    return (
      p.name.toLowerCase().includes(q) ||
      p.purpose.toLowerCase().includes(q) ||
      content.toLowerCase().includes(q)
    );
  });

  const promptStats = { active: 0, conditional: 0, fallback: 0, unused: 0, deprecated: 0 };
  for (const p of system.promptCatalog) {
    promptStats[p.status] += 1;
  }

  const filteredApi = system.apiEndpoints.filter((e) => {
    if (!apiSearch.trim()) return true;
    const q = apiSearch.toLowerCase();
    return `${e.method} ${e.path} ${e.desc} ${e.controller}`.toLowerCase().includes(q);
  });

  const selectedContent = selectedPrompt ? getPromptContent(selectedPrompt) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono mb-2 text-[11px] uppercase tracking-[0.22em] text-primary">
            Архитектура · {system.meta.title}
          </p>
          <h1 className="font-display flex items-center gap-2 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            <Network className="h-7 w-7 text-primary" />
            Карта логики
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Состояние сервера · <span className="mono">v{system.meta.version}</span>
            {promptsGeneratedAt && ` · промпты ${new Date(promptsGeneratedAt).toLocaleString("ru-RU")}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Обновить
        </Button>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск: API, промпт, кнопка, каталог…"
          value={globalSearch}
          onChange={(e) => handleGlobalSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto rounded-xl border border-border bg-card/50 p-1.5 lg:w-56 lg:flex-col lg:self-start lg:overflow-visible lg:sticky lg:top-24">
          {LOGIC_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPanel(item.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                panel === item.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="w-4 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {panel === "overview" && <OverviewPanel system={system} />}
          {panel === "catalog" && <CatalogManager />}
          {panel === "journeys" && <JourneysPanel system={system} />}
          {panel === "pages" && <PagesPanel system={system} />}
          {panel === "api" && (
            <ApiPanel
              system={system}
              filteredApi={filteredApi}
              apiSearch={apiSearch}
              onApiSearch={setApiSearch}
            />
          )}
          {panel === "queues" && <QueuesPanel system={system} />}
          {panel === "agents" && <AgentsPanel system={system} />}
          {panel === "image" && <ImagePanel system={system} />}
          {panel === "prompts" && (
            <PromptsPanel
              items={filteredPrompts}
              stats={promptStats}
              promptSearch={promptSearch}
              promptCategory={promptCategory}
              promptStatus={promptStatus}
              onPromptSearch={setPromptSearch}
              onPromptCategory={setPromptCategory}
              onPromptStatus={setPromptStatus}
              getContent={getPromptContent}
              onSelect={setSelectedPrompt}
            />
          )}
          {panel === "data" && <DataPanel system={system} />}
          {panel === "env" && <EnvPanel system={system} />}
          {panel === "map" && <FlowMapPanel />}
        </div>
      </div>

      {selectedPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <Card className="flex max-h-[85vh] w-full max-w-3xl flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-display text-lg">{selectedPrompt.name}</CardTitle>
                <StatusBadge status={selectedPrompt.status} note={selectedPrompt.statusNote} />
              </div>
                <CardDescription>
                  {selectedPrompt.purpose} · {selectedPrompt.usedBy}
                  {selectedPrompt.statusNote && (
                    <span className="mt-1 block text-amber-400">
                      {selectedPrompt.statusNote}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPrompt(null)}>
                ✕
              </Button>
            </CardHeader>
            <CardContent className="overflow-auto">
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-xs leading-relaxed">
                {selectedContent ?? "(Текст не извлечён — запустите node scripts/extract-logic-prompts.mjs)"}
              </pre>
              <p className="mono mt-2 text-xs text-muted-foreground">{selectedPrompt.file}</p>
            </CardContent>
            <div className="border-t p-4">
              <Button
                size="sm"
                onClick={() => {
                  if (selectedContent) void navigator.clipboard.writeText(selectedContent);
                }}
              >
                <Copy className="mr-1 h-4 w-4" />
                Копировать
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function OverviewPanel({ system }: { system: LogicSystemData }) {
  const ports = system.meta.ports;
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">{system.overview.description}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="mono">Web :{ports.web}</Badge>
        <Badge variant="secondary" className="mono">API :{ports.api}</Badge>
        <Badge variant="outline" className="mono">PG :{ports.postgres}</Badge>
        <Badge variant="outline" className="mono">Redis :{ports.redis}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Режимы генерации</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {system.overview.modes.map((m) => (
              <div key={m.id}>
                <p className="font-medium">{m.label}</p>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Стек</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {system.overview.stack.map((s) => (
              <div key={s.layer} className="flex justify-between gap-2 text-sm">
                <span className="font-medium">{s.layer}</span>
                <span className="text-right text-muted-foreground">{s.tech}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Архитектура</CardTitle>
        </CardHeader>
        <CardContent>
          <MermaidDiagram chart={system.mermaid.architecture} />
        </CardContent>
      </Card>
    </>
  );
}

function JourneysPanel({ system }: { system: LogicSystemData }) {
  return (
    <div className="space-y-4">
      {system.userJourneys.map((j) => (
        <Card key={j.id}>
          <CardHeader>
            <CardTitle className="font-display text-base">{j.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {j.steps.map((s) => (
              <div key={s.n} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                <Badge variant="outline" className="h-6 shrink-0">
                  {s.n}
                </Badge>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="text-[10px]">{s.who}</Badge>
                    <span className="text-sm font-medium">{s.action}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[s.api && `API: ${s.api}`, s.handler, s.file, s.model, s.where, s.storage, s.interval]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PagesPanel({ system }: { system: LogicSystemData }) {
  return (
    <div className="space-y-4">
      {system.pages.map((p) => (
        <Card key={p.route}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">{p.title}</CardTitle>
            <CardDescription>
              <code className="mono">{p.route}</code> · <span className="mono">{p.file}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.actions.map((a) => (
              <div key={a.label} className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {a.method && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${methodClass(a.method)}`}>
                      {a.method}
                    </span>
                  )}
                  <span className="font-medium">{a.label}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[a.path && `path: ${a.path}`, a.upstream && `→ ${a.upstream}`, a.then, a.handler, a.fn, a.target, a.note]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ApiPanel({
  system,
  filteredApi,
  apiSearch,
  onApiSearch,
}: {
  system: LogicSystemData;
  filteredApi: LogicSystemData["apiEndpoints"];
  apiSearch: string;
  onApiSearch: (v: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">NestJS API <span className="mono">(:3001)</span></CardTitle>
          <Input placeholder="Фильтр endpoints…" value={apiSearch} onChange={(e) => onApiSearch(e.target.value)} />
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-2">Method</th>
                <th className="pb-2 pr-2">Path</th>
                <th className="pb-2">Описание</th>
              </tr>
            </thead>
            <tbody>
              {filteredApi.map((e) => (
                <tr key={`${e.method}-${e.path}`} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${methodClass(e.method)}`}>
                      {e.method}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <code className="mono text-xs">{e.path}</code>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {e.desc}
                    {e.auth === false && <span className="ml-1 text-primary">public</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Next.js BFF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {system.bffRoutes.map((r) => (
            <div key={r.path} className="rounded-md border p-3 text-sm">
              <code className="mono text-xs">{r.path}</code>
              <p className="mt-1 text-xs text-muted-foreground">{r.desc}</p>
              <p className="mono text-[11px] text-muted-foreground">{r.file}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function QueuesPanel({ system }: { system: LogicSystemData }) {
  return (
    <>
      {system.queues.map((q) => (
        <Card key={q.name}>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Queue: <code className="mono">{q.name}</code>
            </CardTitle>
            <CardDescription>
              Worker: <span className="mono">{q.worker}</span> · <span className="mono">{q.file}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.jobs.map((j) => (
              <div key={j.name} className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="font-medium">
                  {j.name}
                  {j.jobType ? ` (${j.jobType})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Trigger: {j.trigger}</p>
                <p className="text-xs text-muted-foreground">Processor: {j.processor}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Creative agent pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <MermaidDiagram chart={system.mermaid.creativeAgent} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Generation worker</CardTitle>
        </CardHeader>
        <CardContent>
          <MermaidDiagram chart={system.mermaid.generationWorker} />
        </CardContent>
      </Card>
    </>
  );
}

function AgentsPanel({ system }: { system: LogicSystemData }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Компоненты agent pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {system.agents.map((a) => (
            <div key={a.name} className={`grid gap-1 border-b border-border/50 pb-3 text-sm last:border-0 md:grid-cols-[180px_1fr_auto] ${a.status === "unused" || a.status === "deprecated" ? "opacity-60" : ""}`}>
              <span className="font-medium flex flex-wrap items-center gap-2">
                {a.name}
                {a.status && <StatusBadge status={a.status} note={a.statusNote} />}
              </span>
              <div className="text-muted-foreground">
                <p>{a.when}</p>
                <p className="mono text-xs">{a.file}</p>
                {a.prompt && <p className="text-xs">prompt: <span className="mono">{a.prompt}</span></p>}
                {a.prompts && <p className="text-xs">prompts: <span className="mono">{a.prompts}</span></p>}
              </div>
              <span className="mono text-xs text-muted-foreground">{a.model ?? ""}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Catalog agent pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <MermaidDiagram chart={system.mermaid.catalogAgent} />
        </CardContent>
      </Card>
    </>
  );
}

function ImagePanel({ system }: { system: LogicSystemData }) {
  const ip = system.imagePipeline;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Provider chain (AI mode)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-1 text-sm">
            {ip.chain.map((step) => (
              <li key={step}>
                <span>{step}</span>
                {ip.chainNotes?.[step] && (
                  <span className="ml-2 text-xs text-muted-foreground">— {ip.chainNotes[step]}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1">
            {ip.toggles.map((t) => (
              <Badge key={t} variant="outline" className="mono text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(ip.openrouter).map(([key, block]) => (
            <Card key={key} className={block.status === "conditional" || block.status === "fallback" ? "opacity-80" : ""}>
              <CardHeader>
                <CardTitle className="font-display flex flex-wrap items-center gap-2 text-base capitalize">
                  {key} model
                  {block.status && <StatusBadge status={block.status} note={block.statusNote} />}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <code className="mono text-xs">{block.env}</code>
                <p className="mt-1 text-xs text-muted-foreground">default: <span className="mono">{block.default}</span></p>
                <p className="mt-2">{block.use}</p>
                {block.statusNote && (
                  <p className="mt-2 text-xs text-amber-400">{block.statusNote}</p>
                )}
              </CardContent>
            </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Prompt builders → OpenRouter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ip.promptBuilders.map((pb) => (
            <div
              key={pb.name}
              className={`text-sm ${pb.status === "unused" || pb.status === "fallback" ? "opacity-75" : ""}`}
            >
              <span className="font-medium">{pb.name}</span>
              {pb.status && (
                <span className="ml-2">
                  <StatusBadge status={pb.status} note={pb.statusNote} />
                </span>
              )}
              <span className="text-muted-foreground"> — {pb.when}</span>
              <p className="mono text-xs text-muted-foreground">{pb.file}</p>
              {pb.statusNote && <p className="text-xs text-amber-400">{pb.statusNote}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">LLM routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Primary: <span className="mono">{system.llmRouting.primary}</span></p>
          <p className="text-muted-foreground">Generation: <span className="mono">{system.llmRouting.generation}</span></p>
          {system.llmRouting.prompts.map((p) => (
            <div key={p.fn} className={`rounded border p-2 text-xs ${p.status === "fallback" || p.status === "unused" ? "opacity-75" : ""}`}>
              <span className="mono font-medium">{p.fn}</span>
              {p.status && (
                <span className="ml-2">
                  <StatusBadge status={p.status} note={p.statusNote} />
                </span>
              )}
              <span className="text-muted-foreground"> → {p.usedBy}</span>
              {p.statusNote && <p className="mt-1 text-amber-400">{p.statusNote}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function PromptsPanel({
  items,
  stats,
  promptSearch,
  promptCategory,
  promptStatus,
  onPromptSearch,
  onPromptCategory,
  onPromptStatus,
  getContent,
  onSelect,
}: {
  items: LogicPromptCatalogItem[];
  stats: Record<LogicPromptStatus, number>;
  promptSearch: string;
  promptCategory: string;
  promptStatus: string;
  onPromptSearch: (v: string) => void;
  onPromptCategory: (v: string) => void;
  onPromptStatus: (v: string) => void;
  getContent: (item: LogicPromptCatalogItem) => string | null;
  onSelect: (item: LogicPromptCatalogItem) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {(Object.keys(PROMPT_STATUS_META) as LogicPromptStatus[]).map((s) => (
          <span key={s}>
            <StatusBadge status={s} /> <span className="num">{stats[s]}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select value={promptCategory || "all"} onValueChange={(v) => onPromptCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="llm">LLM</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="presentation">Presentation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={promptStatus || "all"} onValueChange={(v) => onPromptStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(Object.keys(PROMPT_STATUS_META) as LogicPromptStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {PROMPT_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Поиск промптов…" value={promptSearch} onChange={(e) => onPromptSearch(e.target.value)} className="sm:min-w-[200px] sm:flex-1" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => {
          const content = getContent(p);
          const dim = p.status === "unused" || p.status === "deprecated" || p.status === "fallback";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={`rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 ${dim ? "opacity-70" : ""}`}
            >
              <div className="mb-2 flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-[10px]">
                  {p.category}
                </Badge>
                <StatusBadge status={p.status} note={p.statusNote} />
              </div>
              <p className="font-medium text-sm">{p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.purpose}</p>
              {p.statusNote && (
                <p className="mt-1 text-[10px] text-amber-400 line-clamp-2">{p.statusNote}</p>
              )}
              <pre className="mt-2 line-clamp-4 text-[10px] text-muted-foreground">
                {content?.slice(0, 200) ?? "(запустите pnpm logic:extract)"}
              </pre>
            </button>
          );
        })}
      </div>
    </>
  );
}

function DataPanel({ system }: { system: LogicSystemData }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {system.dataModel.map((d) => (
        <Card key={d.entity}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">
              <code className="mono">{d.entity}</code>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {d.key && (
              <p>
                <strong>{d.key}</strong>: {d.flow}
              </p>
            )}
            {d.desc && <p>{d.desc}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EnvPanel({ system }: { system: LogicSystemData }) {
  return (
    <div className="space-y-3">
      {system.envGroups.map((g) => (
        <Card key={g.title}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">{g.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {g.vars.map((v) => (
              <Badge key={v} variant="outline" className="mono text-[10px]">
                {v}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FlowMapPanel() {
  const flows = [
    {
      col: "UI",
      title: "UI (Next.js)",
      nodes: [
        { t: "«Сгенерировать концепции»", s: "/generate → handleGenerate" },
        { t: "«Создать визуализацию»", s: "detail → handleCreateVisualization" },
        { t: "«Перегенерировать» refine", s: "ConceptRefinePanel" },
        { t: "«Подобрать из брифа»", s: "POST /api/brief/parse" },
        { t: "Poll agent-run / request", s: "1.5s interval" },
      ],
    },
    {
      col: "BFF",
      title: "BFF",
      nodes: [
        { t: "/api/backend/*", s: "proxy + X-API-Key" },
        { t: "/api/concepts/generate", s: "create request + submit" },
        { t: "/api/brief/parse", s: "parse-brief" },
      ],
    },
    {
      col: "API",
      title: "NestJS",
      nodes: [
        { t: "AgentRunController", s: "agent-run, select, retry" },
        { t: "RequestsController", s: "generate, regenerate, refine" },
        { t: "GenerationService", s: "enqueue generation" },
        { t: "AgentRunService", s: "enqueue agent-run" },
      ],
    },
    {
      col: "Worker",
      title: "BullMQ",
      nodes: [
        { t: "AgentRunProcessor", s: "Ideator/Critic/Catalog" },
        { t: "GenerationProcessor", s: "LLM + image chain" },
        { t: "RefineProcessor", s: "img2img + logo ref" },
        { t: "conceptResults", s: "variants carousel" },
      ],
    },
    {
      col: "AI",
      title: "OpenRouter",
      nodes: [
        { t: "LLM chat", s: "Ideator, Critic, Brief" },
        { t: "Flux Klein", s: "concept previews ×5" },
        { t: "Gemini Flash Image", s: "final scene + refs" },
        { t: "Refine model", s: "scene + logo img2img" },
      ],
    },
  ];

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-5">
      {flows.map((f) => (
        <Card key={f.col}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">{f.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {f.nodes.map((n) => (
              <div key={n.t} className="rounded border bg-muted/20 p-2 text-xs">
                <p className="font-medium">{n.t}</p>
                <p className="mono text-muted-foreground">{n.s}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
