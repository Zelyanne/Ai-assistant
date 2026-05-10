import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Webhook setup documentation', () => {
  it('documents required WhatsApp and Telegram env variables in apps/agent/.env.example', () => {
    const envExample = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    const projectSuffix = '_PROJECT_GOOGLE_ASSITANT';

    const requiredVariables = [
      'WHATSAPP_PROVIDER',
      'EVOLUTION_API_BASE_URL',
      'EVOLUTION_API_KEY',
      'EVOLUTION_INSTANCE_NAME',
      'EVOLUTION_WEBHOOK_SECRET',
      'WHATSAPP_API_KEY',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_WEBHOOK_SECRET',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_WHATSAPP_PHONE_NUMBER',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_USERNAME',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_WEBHOOK_URL',
    ];

    for (const variable of requiredVariables) {
      expect(envExample).toMatch(new RegExp(`^${variable}${projectSuffix}=`, 'm'));
    }
  });

  it('includes webhook setup URLs in README.md for Evolution API, Meta/Twilio, and Telegram', () => {
    const readme = readFileSync(new URL('../../../../../README.md', import.meta.url), 'utf8');

    expect(readme).toContain('https://doc.evolution-api.com');
    expect(readme).toContain('https://github.com/EvolutionAPI/evolution-api');
    expect(readme).toContain('https://developers.facebook.com/apps/');
    expect(readme).toContain('https://www.twilio.com/docs/whatsapp');
    expect(readme).toContain('https://core.telegram.org/bots/api#setwebhook');
    expect(readme).toContain('https://t.me/BotFather');
    expect(readme).toContain('Production Deployment Checklist');
    expect(readme).toContain('x-evolution-webhook-secret');
    expect(readme).toContain('x-whatsapp-signature');
    expect(readme).toContain('x-twilio-signature');
  });
});
