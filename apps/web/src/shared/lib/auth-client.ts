import { apiKeyClient } from "@better-auth/api-key/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

import { SERVER_URL } from "@/shared/config";

export const authClient = createAuthClient({
  baseURL: `${SERVER_URL}/api/auth`,
  plugins: [apiKeyClient(), oauthProviderClient()],
});
