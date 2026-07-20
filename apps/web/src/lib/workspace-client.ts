import type { WorkspacePayload } from "@/lib/workspace-types";
import { parseApiResponse } from "@/lib/safe-json-response";

export async function fetchWorkspace(): Promise<{
  payload: WorkspacePayload | null;
  updatedAt: string | null;
  userId: string | null;
}> {
  const res = await fetch("/api/workspace", { cache: "no-store" });
  if (!res.ok) return { payload: null, updatedAt: null, userId: null };
  try {
    const data = await parseApiResponse<{
      payload?: WorkspacePayload | null;
      updatedAt?: string | null;
      userId?: string | null;
    }>(res);
    return {
      payload: data.payload ?? null,
      updatedAt: data.updatedAt ?? null,
      userId: data.userId ?? null,
    };
  } catch {
    return { payload: null, updatedAt: null, userId: null };
  }
}

export async function saveWorkspace(payload: WorkspacePayload): Promise<string | null> {
  const res = await fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) return null;
  try {
    const data = await parseApiResponse<{ updatedAt?: string }>(res);
    return data.updatedAt ?? null;
  } catch {
    return null;
  }
}
