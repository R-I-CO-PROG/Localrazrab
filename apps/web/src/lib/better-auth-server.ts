import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { isEmailConfigured, sendVerificationEmailMail } from "@/lib/email";
import { isUserBlocked } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getBaseURL(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

function getTrustedOrigins(): string[] {
  const origins = new Set<string>();
  for (const url of [getBaseURL(), process.env.NEXT_PUBLIC_APP_URL]) {
    if (!url) continue;
    const normalized = url.replace(/\/$/, "");
    origins.add(normalized);
    try {
      const parsed = new URL(normalized);
      if (parsed.hostname.startsWith("www.")) {
        origins.add(`${parsed.protocol}//${parsed.hostname.slice(4)}`);
      } else {
        origins.add(`${parsed.protocol}//www.${parsed.hostname}`);
      }
    } catch {
      // ignore invalid URL
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
  }
  return [...origins];
}

const emailVerificationEnabled = isEmailConfigured();

export const auth = betterAuth({
  baseURL: getBaseURL(),
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: getTrustedOrigins(),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: emailVerificationEnabled,
    autoSignIn: !emailVerificationEnabled,
  },
  ...(emailVerificationEnabled
    ? {
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60 * 24,
          sendVerificationEmail: async ({ user, url }) => {
            await sendVerificationEmailMail(user.email, user.name, url);
          },
        },
      }
    : {}),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (await isUserBlocked(session.userId)) {
            throw new Error("Аккаунт заблокирован");
          }
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          try {
            const email = user.email?.toLowerCase();
            if (!email || !getAdminEmails().includes(email)) return;
            await prisma.user.update({
              where: { id: user.id },
              data: { role: "ADMIN" },
            });
          } catch (error) {
            console.error("[auth] failed to assign admin role", error);
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
