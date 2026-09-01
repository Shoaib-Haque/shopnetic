/**
 * Transactional email copy.
 *
 * TODO(i18n): move to a proper message catalog (`messages/<locale>/identity.*`)
 * once the API gets an ICU/next-intl runtime. Until then this typed record is
 * the API-side equivalent — copy still lives in one place, keyed, not inlined at
 * the call site (plan/CODING-RULES.md §L3).
 */
export type MailLocale = 'en';

interface MailTemplate {
  subject: string;
  /** `{link}` is substituted. */
  text: string;
}

interface IdentityMailCatalog {
  verifyEmail: MailTemplate;
  alreadyRegistered: MailTemplate;
}

const CATALOG: Record<MailLocale, IdentityMailCatalog> = {
  en: {
    verifyEmail: {
      subject: 'Confirm your Shopnetic email address',
      text: [
        'Welcome to Shopnetic.',
        '',
        'Confirm your email address to activate your account:',
        '{link}',
        '',
        'This link expires in 24 hours. If you did not create an account, ignore this email.',
      ].join('\n'),
    },
    alreadyRegistered: {
      subject: 'You already have a Shopnetic account',
      text: [
        'Someone tried to sign up with this email address, but an account already exists.',
        '',
        'If this was you, sign in instead:',
        '{link}',
        '',
        'If you have forgotten your password, use the "Forgot password" link on that page.',
      ].join('\n'),
    },
  },
};

export function identityMail(locale: MailLocale = 'en'): IdentityMailCatalog {
  return CATALOG[locale];
}

export function renderTemplate(
  tpl: MailTemplate,
  vars: { link: string },
): {
  subject: string;
  text: string;
} {
  return { subject: tpl.subject, text: tpl.text.replaceAll('{link}', vars.link) };
}
