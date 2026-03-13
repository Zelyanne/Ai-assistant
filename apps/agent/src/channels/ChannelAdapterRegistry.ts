import { Channel } from '@ai-assistant/shared';
import { ChannelAdapter } from './ChannelAdapter.js';
import { TelegramAdapter } from './TelegramAdapter.js';
import { WebChatAdapter } from './WebChatAdapter.js';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';

export class ChannelAdapterRegistry {
  private readonly adapters = new Map<Channel, ChannelAdapter>();

  constructor(adapters: ChannelAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.channel, adapter);
    }
  }

  get(channel: Channel): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${channel}`);
    }

    return adapter;
  }

  has(channel: Channel): boolean {
    return this.adapters.has(channel);
  }

  listChannels(): Channel[] {
    return Array.from(this.adapters.keys());
  }

  static createDefault(): ChannelAdapterRegistry {
    return new ChannelAdapterRegistry([
      new WebChatAdapter(),
      new TelegramAdapter({
        bot_token: process.env.TELEGRAM_BOT_TOKEN,
        webhook_secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      }),
      new WhatsAppAdapter({
        webhook_signing_secret: process.env.WHATSAPP_WEBHOOK_SECRET,
        whatsapp_api_key: process.env.WHATSAPP_API_KEY,
        whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
        twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
        twilio_auth_token: process.env.TWILIO_AUTH_TOKEN,
        twilio_whatsapp_phone_number: process.env.TWILIO_WHATSAPP_PHONE_NUMBER,
      }),
    ]);
  }
}

export const channelAdapterRegistry = ChannelAdapterRegistry.createDefault();
