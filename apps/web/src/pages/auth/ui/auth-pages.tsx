import type { ReactNode } from "react";

import { SignInForm } from "@/features/sign-in";
import { SignUpForm } from "@/features/sign-up";
import { BrandMark } from "@/shared/ui";

const AuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-1 flex-col">
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-10 md:px-[30px] lg:grid-cols-2">
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

export const SignInPage = ({ redirectTo }: { redirectTo?: string }) => (
  <AuthLayout>
    <SignInForm redirectTo={redirectTo} />
  </AuthLayout>
);

export const SignUpPage = ({ redirectTo }: { redirectTo?: string }) => (
  <AuthLayout>
    <SignUpForm redirectTo={redirectTo} />
  </AuthLayout>
);
