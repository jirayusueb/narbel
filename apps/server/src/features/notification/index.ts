export {
  createNotificationConsumers,
  createNotificationModule,
  type NotificationDeps,
} from "./ioc";
// boards builds this for invitations until they become the MemberInvited event
export { DrizzleNotificationRepository } from "./infrastructure/repositories/DrizzleNotificationRepository";
