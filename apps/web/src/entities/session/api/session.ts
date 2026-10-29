import { authClient } from "@/shared/lib";

export const { useSession } = authClient;

export const fetchSession = () => authClient.getSession();
