import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useSession } from "@/entities/session";
import { SignInForm } from "@/features/sign-in";
import { SignUpForm } from "@/features/sign-up";
import { BrandMark } from "@/shared/ui";

const AuthLayout = ({
  redirectTo,
  children,
}: {
  redirectTo?: string;
  children: ReactNode;
}) => {
  const router = useRouter();
  const { data: session } = useSession();

  // The form renders on the server right away; a visitor who turns out to be signed in
  // moves on once the session answers. A signed OAuth request (`sig`) stays: the user
  // may be switching accounts, and the provider resumes it from this page.
  useEffect(() => {
    const oauthPending = new URLSearchParams(window.location.search).has("sig");
    if (session && !oauthPending) {
      router.history.replace(redirectTo ?? "/dashboard");
    }
  }, [session, redirectTo, router]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-10 max-[19rem]:px-3 md:px-[30px] lg:grid-cols-2">
        {children}
        <div className="hidden flex-col items-start gap-8 lg:flex">
          <BrandMark className="size-20" />
          <p className="font-display text-title text-muted-foreground max-w-md leading-tight font-normal">
            Boards your team and its agents share.
          </p>
        </div>
      </div>
    </div>
  );
};

export const SignInPage = ({ redirectTo }: { redirectTo?: string }) => (
  <AuthLayout redirectTo={redirectTo}>
    <SignInForm redirectTo={redirectTo} />
  </AuthLayout>
);

export const SignUpPage = ({ redirectTo }: { redirectTo?: string }) => (
  <AuthLayout redirectTo={redirectTo}>
    <SignUpForm redirectTo={redirectTo} />
  </AuthLayout>
);
