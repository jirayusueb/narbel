import { ClaimUsernameForm } from "@/features/claim-username";
import { BrandMark } from "@/shared/ui";

export const OnboardingPage = () => (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-10 px-5 py-10 md:px-[30px]">
      <BrandMark className="size-8" />
      <div className="flex flex-1 items-center">
        <ClaimUsernameForm />
      </div>
    </div>
  </div>
);
