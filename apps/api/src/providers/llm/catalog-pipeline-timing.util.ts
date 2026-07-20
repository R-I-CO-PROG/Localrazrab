export interface PipelineTimingStage {
  name: string;
  ms: number;
}

/** Накопитель длительностей этапов catalog-пайплайна (discoverConcepts). */
export class CatalogPipelineTiming {
  private readonly startedAt = Date.now();
  private lapAt = this.startedAt;
  private readonly stages: PipelineTimingStage[] = [];

  /** Зафиксировать длительность с прошлого lap() / создания. */
  lap(name: string): void {
    const now = Date.now();
    this.stages.push({ name, ms: now - this.lapAt });
    this.lapAt = now;
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  toRecord(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.stages) {
      out[s.name] = (out[s.name] ?? 0) + s.ms;
    }
    out.total = this.totalMs();
    return out;
  }

  toTable(): string {
    const lines = this.stages.map((s) => `${s.name}\t${s.ms}`);
    lines.push(`total\t${this.totalMs()}`);
    return lines.join('\n');
  }

  stagesSnapshot(): PipelineTimingStage[] {
    return [...this.stages, { name: 'total', ms: this.totalMs() }];
  }
}

export async function timedStage<T>(
  timing: CatalogPipelineTiming,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } finally {
    timing.lap(name);
  }
}

export function timedStageSync<T>(
  timing: CatalogPipelineTiming,
  name: string,
  fn: () => T,
): T {
  try {
    return fn();
  } finally {
    timing.lap(name);
  }
}
