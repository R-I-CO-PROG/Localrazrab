import { NextRequest, NextResponse } from "next/server";
import {
  fetchCatalogImageUpstream,
  isAllowedCatalogImageProxyUrl,
} from "@/lib/catalog-image-proxy";

export const runtime = "nodejs";

/** Same-origin прокси для HTTP CDN (midocean) — без mixed content и без hotlink-блокировки. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  if (!isAllowedCatalogImageProxyUrl(raw)) {
    return NextResponse.json({ error: "Invalid or disallowed image URL" }, { status: 400 });
  }

  try {
    const upstream = await fetchCatalogImageUpstream(raw);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream image not found (${upstream.status})` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Upstream response is not an image" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to fetch upstream image" }, { status: 502 });
  }
}
