import { useState } from "react";

import { SignInForm } from "@/features/sign-in";
import { SignUpForm } from "@/features/sign-up";

export const LoginPage = () => {
  const [showSignIn, setShowSignIn] = useState(false);

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
  );
};
