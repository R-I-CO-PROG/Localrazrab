import { NextResponse } from "next/server";
import { getOrCreateDbUser, getSessionUserId, pingAuthDatabase } from "@/lib/auth";
import { getAuthConfigIssue, isAuthEnabled, isDatabaseConfigured, PLAN_LABELS } from "@/lib/auth-config";
import { isUserBlocked } from "@/lib/admin-users";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      authConfigured: false,
      dbConfigured: isDatabaseConfigured(),
      message: getAuthConfigIssue() ?? "Better Auth не настроен",
    });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      authConfigured: true,
      dbConfigured: false,
      message: "DATABASE_URL не настроен. Подключите PostgreSQL",
    });
  }

  const dbIssue = await pingAuthDatabase();
  if (dbIssue) {
    return NextResponse.json(
      {
        authConfigured: true,
        dbConfigured: false,
        dbError: true,
        message: dbIssue,
      },
      { status: 503 }
    );
  }

  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      const sessionUserId = await getSessionUserId();
      if (sessionUserId && (await isUserBlocked(sessionUserId))) {
        return NextResponse.json(
          {
            authConfigured: true,
            dbConfigured: true,
            authenticated: false,
            blocked: true,
            message: "Аккаунт заблокирован. Обратитесь к администратору.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { authConfigured: true, dbConfigured: true, authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authConfigured: true,
      dbConfigured: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        plan: user.plan,
        planLabel: PLAN_LABELS[user.plan] ?? user.plan,
        credits: user.credits,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[api/me]", error);
    return NextResponse.json(
      {
        authConfigured: true,
        dbConfigured: true,
        dbError: true,
        message: "Не удалось подключиться к базе данных",
      },
      { status: 503 }
    );
  }
}
