import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { requireAdmin } from "@/lib/admin";

function resolveMapPath(): string {
  const candidates = [
    join(process.cwd(), "data", "catalog-category-map.json"),
    join(process.cwd(), "../../data/catalog-category-map.json"),
    "/var/www/Mercai-v2/data/catalog-category-map.json",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const path = resolveMapPath();
  if (!existsSync(path)) {
    return NextResponse.json({ error: "catalog-category-map.json not found" }, { status: 404 });
  }

  const raw = readFileSync(path, "utf8");
  return NextResponse.json(JSON.parse(raw));
}
