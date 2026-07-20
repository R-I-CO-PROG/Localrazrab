import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { adjustUserCredits, findUserByEmailOrId } from "@/lib/credits";

const grantSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.string().min(1).optional(),
    amount: z.number().int(),
    mode: z.enum(["add", "set", "deduct"]).default("add"),
    note: z.string().max(500).optional(),
  })
  .refine((data) => data.email || data.userId, {
    message: "Укажите email или userId",
  })
  .refine((data) => (data.mode === "set" ? data.amount >= 0 : data.amount > 0), {
    message: "Укажите корректное количество кредитов",
  });

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const data = grantSchema.parse(body);

    const target = await findUserByEmailOrId({
      email: data.email?.toLowerCase(),
      userId: data.userId,
    });

    if (!target) {
      return NextResponse.json(
        { error: "Пользователь не найден. Сначала он должен зарегистрироваться." },
        { status: 404 }
      );
    }

    const updated = await adjustUserCredits({
      userId: target.id,
      amount: data.amount,
      mode: data.mode,
      adminUserId: auth.user.id,
      note: data.note,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        credits: updated.credits,
        role: updated.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Ошибка начисления";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
