import { NextRequest, NextResponse } from "next/server";
import { fetchCatalogImageUpstream } from "@/lib/catalog-image-proxy";

export const runtime = "nodejs";

/**
 * Замена next.config rewrite `/midocean-img/*` — в standalone rewrite на внешний HTTP CDN
 * иногда не срабатывает; явный route handler надёжнее.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const upstreamUrl = `http://cdn.midoceanbrands.ru/${(path ?? []).join("/")}`;

  try {
    const upstream = await fetchCatalogImageUpstream(upstreamUrl);
    if (!upstream.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 400 });
    }
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  }
}
