import type { INotificationRepository } from "../../../shared/application/interfaces/i-notifications";
import type { IOutbox } from "../../../shared/application/interfaces/i-outbox";
import type { IProcessedEvents } from "../../../shared/application/interfaces/i-processed-events";
import type { IProfileReader } from "../../../shared/application/interfaces/i-profiles";

export const NOTIFICATION_CONSUMER = "notification";

export interface NotificationTx {
  notifications: INotificationRepository;
  outbox: IOutbox;
  processed: IProcessedEvents;
  people: IProfileReader;
}
