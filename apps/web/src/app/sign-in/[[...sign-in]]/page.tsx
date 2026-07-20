import { Suspense } from "react";
import Image from "next/image";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthRedirectIfLoggedIn } from "@/components/auth/auth-redirect-if-logged-in";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Suspense fallback={null}>
        <AuthRedirectIfLoggedIn />
      </Suspense>
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/logo-full.png"
          alt="Мерцай"
          width={220}
          height={108}
          className="h-auto w-[200px] object-contain"
          priority
          unoptimized
        />
        <p className="mt-2 text-sm text-muted-foreground">Вход в аккаунт</p>
      </div>
      <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-xl bg-muted" />}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
