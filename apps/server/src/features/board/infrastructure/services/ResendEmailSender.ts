import type { Email, IEmailSender } from "../../application/ports/IEmailSender";

export interface ResendConfig {
  RESEND_API_KEY: string;
  RESEND_FROM: string;
}

export class ResendEmailSender implements IEmailSender {
  constructor(
    private readonly config: ResendConfig,
    private readonly http: typeof fetch = fetch
  ) {}

  async send(email: Email) {
    try {
      const response = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.config.RESEND_FROM, ...email }),
      });
      if (!response.ok) {
        console.error(
          `Resend rejected the invite email: ${response.status} ${await response.text()}`
        );
      }
      return response.ok;
    } catch (error) {
      console.error("Resend request failed", error);
      return false;
    }
  }
}
