import { useEventSource } from "@reactuses/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { SERVER_URL } from "@/shared/config";

import { NOTIFICATIONS_KEY } from "../api/notifications";

const EVENTS = ["notification"];
const OPTIONS = { withCredentials: true };

// No autoReconnect: the browser reconnects an EventSource on its own (the server sends `retry: 3000`).
export const useNotificationStream = () => {
  const queryClient = useQueryClient();
  // Each `notification` event carries a new notification with its own id, so new data means one arrived.
  const { data } = useEventSource(
    `${SERVER_URL}/api/notifications/stream`,
    EVENTS,
    OPTIONS
  );
  useEffect(() => {
    if (data !== null) {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  }, [data, queryClient]);
};
