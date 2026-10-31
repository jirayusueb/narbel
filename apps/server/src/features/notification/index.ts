export {
  createNotificationConsumers,
  createNotificationModule,
  type NotificationDeps,
} from "./ioc";
// board builds this for invitations until step 6 moves them to the MemberInvited event
export { DrizzleNotificationRepository } from "./infrastructure/repositories/DrizzleNotificationRepository";
