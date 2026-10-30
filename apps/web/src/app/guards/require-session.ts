import { redirect } from "@tanstack/react-router";

import { fetchSession } from "@/entities/session";
import { api, unwrap } from "@/shared/api";
import { safeRedirect } from "@/shared/lib";

interface Where {
  href: string;
}

// The destination rides along as `redirect` so a shared link survives sign-in and onboarding.
export const requireSession = async (from: Where) => {
  const session = await fetchSession();
  if (!session.data) {
    throw redirect({
      to: "/login",
      search: { redirect: safeRedirect(from.href) },
    });
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

export const requireOnboarded = async ({ location }: { location: Where }) => {
  const { userId, session } = await requireSession(location);
  if (!(await hasUsername(userId))) {
    throw redirect({
      to: "/onboarding",
      search: { redirect: safeRedirect(location.href) },
    });
  }
  return { session };
};

export const requireNotOnboarded = async ({
  location,
  search,
}: {
  location: Where;
  search: { redirect?: string };
}) => {
  const { userId } = await requireSession(location);
  if (await hasUsername(userId)) {
    throw redirect({ href: search.redirect ?? "/dashboard" });
  }
};
