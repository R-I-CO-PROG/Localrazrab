export type LogicPanelId =
  | 'overview'
  | 'catalog'
  | 'journeys'
  | 'pages'
  | 'api'
  | 'queues'
  | 'agents'
  | 'image'
  | 'prompts'
  | 'data'
  | 'env'
  | 'map';

export type LogicPromptStatus =
  | "active"
  | "conditional"
  | "fallback"
  | "unused"
  | "deprecated";

export interface LogicPromptEntry {
  id: string;
  name: string;
  type: string;
  file: string;
  content: string;
}

export interface LogicPromptCatalogItem {
  id: string;
  name: string;
  category: string;
  file: string;
  usedBy: string;
  purpose: string;
  status: LogicPromptStatus;
  statusNote?: string;
}

export interface LogicSystemData {
  meta: {
    title: string;
    version: string;
    ports: Record<string, number>;
  };
  overview: {
    description: string;
    modes: { id: string; label: string; description: string }[];
    stack: { layer: string; tech: string }[];
  };
  userJourneys: {
    id: string;
    title: string;
    steps: {
      n: number;
      who: string;
      action: string;
      api?: string;
      handler?: string;
      file?: string;
      model?: string;
      where?: string;
      storage?: string;
      interval?: string;
    }[];
  }[];
  pages: {
    route: string;
    file: string;
    title: string;
    actions: {
      label: string;
      type?: string;
      method?: string;
      path?: string;
      upstream?: string;
      then?: string;
      handler?: string;
      fn?: string;
      target?: string;
      note?: string;
      storage?: string;
    }[];
  }[];
  apiEndpoints: {
    method: string;
    path: string;
    controller: string;
    auth?: boolean;
    desc: string;
  }[];
  bffRoutes: { path: string; file: string; desc: string }[];
  queues: {
    name: string;
    file: string;
    worker: string;
    jobs: { name: string; jobType?: string; trigger: string; processor: string }[];
  }[];
  agents: {
    name: string;
    file: string;
    prompt?: string;
    prompts?: string;
    model?: string;
    when: string;
    status?: LogicPromptStatus;
    statusNote?: string;
  }[];
  imagePipeline: {
    chain: string[];
    chainNotes?: Record<string, string>;
    toggles: string[];
    openrouter: Record<string, { env: string; default: string; use: string; status?: LogicPromptStatus; statusNote?: string }>;
    promptBuilders: { name: string; file: string; when: string; status?: LogicPromptStatus; statusNote?: string }[];
  };
  llmRouting: {
    primary: string;
    generation: string;
    prompts: { fn: string; usedBy: string; status?: LogicPromptStatus; statusNote?: string }[];
  };
  dataModel: { entity: string; key?: string; flow?: string; desc?: string }[];
  envGroups: { title: string; vars: string[] }[];
  mermaid: Record<string, string>;
  promptCatalog: LogicPromptCatalogItem[];
}

export interface LogicDataResponse {
  system: LogicSystemData;
  prompts: { generatedAt: string; prompts: LogicPromptEntry[] };
}

/** Admin logic panel: Prisma schema tables overview */
export interface LogicSchemaTablesData {
  source?: string;
  generatedAt?: string;
  tables: {
    model: string;
    table?: string;
    group: string;
    fields: {
      name: string;
      type: string;
      optional?: boolean;
      key?: string;
      attributes?: string;
      note?: string;
    }[];
  }[];
}
