import { getAgentRun } from "@/lib/suvenir-client";
import { formatAgentError } from "@/lib/format-agent-error";
import type { AgentRun } from "@/lib/suvenir-types";

const TERMINAL = new Set(["awaiting_idea_selection", "idea_selected", "failed"]);

function isRetryablePollError(message: string): boolean {
  return /недоступен|перегружен|UPSTREAM|503|502|504|fetch failed/i.test(message);
}

export async function pollAgentRunUntilReady(
  requestId: string,
  onUpdate?: (run: AgentRun) => void,
  maxMs = 300_000,
): Promise<AgentRun> {
  const started = Date.now();

  while (Date.now() - started < maxMs) {
    try {
      const run = await getAgentRun(requestId);
      onUpdate?.(run);

      if (TERMINAL.has(run.status)) {
        if (run.status === "failed") {
          throw new Error(formatAgentError(run.error));
        }
        return run;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetryablePollError(message) && Date.now() - started < maxMs) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  throw new Error("Подбор концепций занял слишком долго");
}
