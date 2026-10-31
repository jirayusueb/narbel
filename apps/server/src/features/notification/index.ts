export { createNotificationModule, type NotificationDeps } from "./ioc";
// board builds this itself until step 5 moves comment side effects to outbox events
export { DrizzleNotificationRepository } from "./infrastructure/repositories/DrizzleNotificationRepository";
