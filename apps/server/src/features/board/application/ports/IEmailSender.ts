export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface IEmailSender {
  /** Resolves false when the provider refused or was unreachable; never throws. */
  send(email: Email): Promise<boolean>;
}
