"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthRedirectIfLoggedIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending || !session?.user) return;
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.replace(callbackUrl);
  }, [isPending, session, router, searchParams]);

  return null;
}
