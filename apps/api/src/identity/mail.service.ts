import { Injectable, Logger } from '@nestjs/common';
import { MailQueueService } from '../queue/mail-queue.service.js';
import { identityMail, renderTemplate, type MailLocale } from './mail.templates.js';

/** Renders the template and enqueues — doesn't send anything itself.
 * `apps/workers` owns the actual SMTP delivery, retries, and backoff
 * (`plan/31-background-jobs-and-queues.md` section 3). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly queue: MailQueueService) {}

  async sendVerification(to: string, link: string, locale: MailLocale = 'en'): Promise<void> {
    const { subject, text } = renderTemplate(identityMail(locale).verifyEmail, { link });
    await this.send(to, subject, text);
    this.logger.log(`verification email queued for ${maskEmail(to)}`);
  }

  async sendAlreadyRegistered(
    to: string,
    loginUrl: string,
    locale: MailLocale = 'en',
  ): Promise<void> {
    const { subject, text } = renderTemplate(identityMail(locale).alreadyRegistered, {
      link: loginUrl,
    });
    await this.send(to, subject, text);
    this.logger.log(`already-registered notice queued for ${maskEmail(to)}`);
  }

  async sendStaffInvite(
    to: string,
    acceptUrl: string,
    role: string,
    locale: MailLocale = 'en',
  ): Promise<void> {
    const { subject, text } = renderTemplate(identityMail(locale).staffInvite, {
      link: acceptUrl,
      role,
    });
    await this.send(to, subject, text);
    this.logger.log(`staff invite queued for ${maskEmail(to)} (${role})`);
  }

  async sendStaffPasswordReset(
    to: string,
    resetUrl: string,
    locale: MailLocale = 'en',
  ): Promise<void> {
    const { subject, text } = renderTemplate(identityMail(locale).staffPasswordReset, {
      link: resetUrl,
    });
    await this.send(to, subject, text);
    this.logger.log(`staff password-reset email queued for ${maskEmail(to)}`);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.queue.enqueue({ to, subject, text });
  }
}

/** Never log a full address (plan/CODING-RULES.md section O5). */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}
