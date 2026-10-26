import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** SMTP mailer (Mailpit locally, an EU provider like Brevo/Postmark EU in production). */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    this.transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
    this.from = env.MAIL_FROM;
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      this.logger.log(`[mail disabled] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
      return;
    }
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Minimal branded HTML layout for transactional mails. */
export function mailLayout(
  title: string,
  body: string,
  action?: { label: string; url: string },
): string {
  const button = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#1d5ef1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;max-width:560px;margin:auto;padding:24px">
<h2 style="margin-top:0">${escapeHtml(title)}</h2><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>${button}
<p style="color:#64748b;font-size:12px">Family Planer</p></body></html>`;
}
