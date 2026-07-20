import { NextRequest, NextResponse } from "next/server";
import { spendCreditsForRequest } from "@/lib/api-credits";
import { classifyBackendPath } from "@/lib/backend-credit-paths";
import { getSessionUserId } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth-config";
import { refundCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 600;

const UPSTREAM = (process.env.SUVENIR_API_URL || "http://localhost:3001").replace(/\/$/, "");
const API_SECRET = process.env.API_SECRET_KEY?.trim() ?? "";

async function proxyRequest(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const path = pathSegments.join("/");
  const search = req.nextUrl.search;
  const target = `${UPSTREAM}/${path}${search}`;

  const headers = new Headers();
  if (API_SECRET) {
    headers.set("X-API-Key", API_SECRET);
  }
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim();
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (err) {
    console.error("[api/backend] upstream fetch failed", target, err);
    return NextResponse.json(
      {
        message:
          "Сервер API временно недоступен (перегружен или перезапускается). Подождите 30 секунд и повторите.",
        code: "UPSTREAM_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type RouteCtx = { params: Promise<{ path: string[] }> };

async function handleWithCredits(
  req: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const classified = classifyBackendPath(req.method, pathSegments);
  if (!classified) {
    return proxyRequest(req, pathSegments);
  }

  // AI-действие без списания: достаточно авторизации (иначе запрос к LLM не уйдёт).
  if (classified.kind === "auth") {
    if (isAuthEnabled()) {
      const userId = await getSessionUserId();
      if (!userId) {
        return NextResponse.json(
          {
            error: "Для использования функций генерации необходимо войти в систему.",
            code: "AUTH_REQUIRED",
          },
          { status: 401 },
        );
      }
    }
    return proxyRequest(req, pathSegments);
  }

  const creditAction = classified.action;
  const spend = await spendCreditsForRequest(creditAction, {
    path: pathSegments.join("/"),
  });
  if (!spend.ok) return spend.response;

  const response = await proxyRequest(req, pathSegments);
  if (response.status >= 400 && spend.cost > 0) {
    const userId = await getSessionUserId();
    if (userId) {
      try {
        await refundCredits({
          userId,
          action: creditAction,
          amount: spend.cost,
          metadata: { reason: "upstream_failed", status: response.status },
        });
      } catch (refundError) {
        console.error("[api/backend] refund failed", refundError);
      }
    }
  }

  if (spend.creditsRemaining != null && response.headers.get("content-type")?.includes("json")) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const enriched = {
          ...data,
          creditsUsed: spend.cost,
          creditsRemaining: spend.creditsRemaining,
        };
        const headers = new Headers(response.headers);
        return NextResponse.json(enriched, { status: response.status, headers });
      }
    } catch {
      // pass through original body
    }
  }

  return response;
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return handleWithCredits(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxyRequest(req, path);
}
