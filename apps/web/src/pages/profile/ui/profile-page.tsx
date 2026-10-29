import { ProfileForm } from "@/features/profile-settings";

export const ProfilePage = () => (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 pt-10 pb-24 md:px-[30px] md:pt-16">
      <h1 className="font-display text-title leading-none font-normal md:text-[56px]">
        Profile
      </h1>
      <ProfileForm />
    </div>
  </div>
);
