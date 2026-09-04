import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { identityMail, renderTemplate, type MailLocale } from './mail.templates.js';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  onModuleInit(): void {
    this.transporter = createTransport(this.env.SMTP_URL);
  }

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

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.env.MAIL_FROM, to, subject, text });
  }
}

/** Never log a full address (plan/CODING-RULES.md section O5). */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}
