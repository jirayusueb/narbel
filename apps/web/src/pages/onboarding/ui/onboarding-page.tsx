import { ClaimUsernameForm } from "@/features/claim-username";
import { BrandMark } from "@/shared/ui";

export const OnboardingPage = ({ redirectTo }: { redirectTo?: string }) => (
  <div className="flex flex-1 flex-col">
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-10 md:px-[30px]">
      <BrandMark className="size-8" />
      <div className="flex flex-1 items-center">
        <ClaimUsernameForm redirectTo={redirectTo} />
      </div>
    </div>
  </div>
);
