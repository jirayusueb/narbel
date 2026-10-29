import { redirect } from "@tanstack/react-router";

import { fetchSession } from "@/entities/session";

export const requireSession = async () => {
  const session = await fetchSession();
  if (!session.data) {
    throw redirect({ to: "/login" });
  }
  return { session };
};
