import type {
  Email,
  IEmailSender,
} from "../../application/interfaces/IEmailSender";

export interface ResendConfig {
  RESEND_API_KEY: string;
  RESEND_FROM: string;
}

export class ResendEmailSender implements IEmailSender {
  constructor(
    private readonly config: ResendConfig,
    private readonly http: typeof fetch = fetch
  ) {}

  async send(email: Email, idempotencyKey: string) {
    const response = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: this.config.RESEND_FROM, ...email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // the provider body can echo the recipient address, so only the status is kept
      throw new Error(`Resend ${response.status}`);
    }
  }
}
