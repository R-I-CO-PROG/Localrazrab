import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { isAuthEnabled, isDatabaseConfigured } from "@/lib/auth-config";

export async function GET() {
  if (!isAuthEnabled() || !isDatabaseConfigured()) {
    return NextResponse.json({ isAdmin: false, configured: false });
  }

  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ isAdmin: false, configured: true, authenticated: false });
  }

  return NextResponse.json({
    isAdmin: isAdminUser(user),
    configured: true,
    authenticated: true,
  });
}
