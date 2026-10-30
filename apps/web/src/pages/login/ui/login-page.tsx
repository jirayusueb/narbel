import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { SignInForm } from "@/features/sign-in";
import { SignUpForm } from "@/features/sign-up";
import { BrandMark } from "@/shared/ui";

export const LoginPage = ({ redirectTo }: { redirectTo?: string }) => {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-10 md:px-[30px] lg:grid-cols-2">
        <motion.div layout transition={{ duration: 0.22 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={showSignIn ? "sign-in" : "sign-up"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {showSignIn ? (
                <SignInForm
                  redirectTo={redirectTo}
                  onSwitchToSignUp={() => setShowSignIn(false)}
                />
              ) : (
                <SignUpForm
                  redirectTo={redirectTo}
                  onSwitchToSignIn={() => setShowSignIn(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
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
