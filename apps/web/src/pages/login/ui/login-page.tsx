import { useState } from "react";

import { SignInForm } from "@/features/sign-in";
import { SignUpForm } from "@/features/sign-up";
import { BrandMark } from "@/shared/ui";

export const LoginPage = () => {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid min-h-full w-full max-w-6xl items-center gap-16 px-5 py-10 md:px-[30px] lg:grid-cols-2">
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
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
