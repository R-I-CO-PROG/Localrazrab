import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import {
  AdminUserActionError,
  assertNotSelf,
  deleteUserAccount,
  setUserBlocked,
  setUserRole,
} from "@/lib/admin-users";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setRole"),
    role: z.enum(["USER", "ADMIN"]),
  }),
  z.object({
    action: z.literal("block"),
  }),
  z.object({
    action: z.literal("unblock"),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: targetId } = await context.params;

  try {
    const body = patchSchema.parse(await request.json());

    if (body.action === "setRole") {
      assertNotSelf(auth.user.id, targetId, "изменить роль у");
      const updated = await setUserRole(
        targetId,
        body.role === "ADMIN" ? UserRole.ADMIN : UserRole.USER
      );
      return NextResponse.json({ success: true, user: serializeUser(updated) });
    }

    if (body.action === "block") {
      assertNotSelf(auth.user.id, targetId, "заблокировать");
      const updated = await setUserBlocked(targetId, true);
      return NextResponse.json({ success: true, user: serializeUser(updated) });
    }

    const updated = await setUserBlocked(targetId, false);
    return NextResponse.json({ success: true, user: serializeUser(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные", details: error.errors }, { status: 400 });
    }
    if (error instanceof AdminUserActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Ошибка обновления пользователя";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: targetId } = await context.params;

  try {
    assertNotSelf(auth.user.id, targetId, "удалить");
    await deleteUserAccount(targetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminUserActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Ошибка удаления";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  credits: number;
  role: string;
  plan: string;
  blocked: boolean;
  blockedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    credits: user.credits,
    role: user.role,
    plan: user.plan,
    blocked: user.blocked,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
