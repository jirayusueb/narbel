import { redirect } from "@tanstack/react-router";

import { fetchSession } from "@/entities/session";
import { api, unwrap } from "@/shared/api";

export const requireSession = async () => {
  const session = await fetchSession();
  if (!session.data) {
    throw redirect({ to: "/login" });
  }
  return { session, userId: session.data.user.id };
};

// A username is set once and never changes, so a positive answer is cached for the tab's lifetime.
const onboarded = new Set<string>();

const hasUsername = async (userId: string) => {
  if (!onboarded.has(userId)) {
    const me = unwrap(await api.api.me.get());
    if (me.username) {
      onboarded.add(userId);
    }
  }
  return onboarded.has(userId);
};

export const requireOnboarded = async () => {
  const { userId, session } = await requireSession();
  if (!(await hasUsername(userId))) {
    throw redirect({ to: "/onboarding" });
  }
  return { session };
};

export const requireNotOnboarded = async () => {
  const { userId } = await requireSession();
  if (await hasUsername(userId)) {
    throw redirect({ to: "/dashboard" });
  }
};
