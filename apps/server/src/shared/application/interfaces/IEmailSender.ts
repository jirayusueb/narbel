export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface IEmailSender {
  /**
   * Throws when the provider did not accept the email. The same `idempotencyKey` is never
   * delivered twice, so a retry after an unknown outcome is safe.
   */
  send(email: Email, idempotencyKey: string): Promise<void>;
}
