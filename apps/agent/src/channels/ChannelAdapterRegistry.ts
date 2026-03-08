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
      new TelegramAdapter({ webhook_secret_token: process.env.TELEGRAM_WEBHOOK_SECRET }),
      new WhatsAppAdapter({ webhook_signing_secret: process.env.WHATSAPP_WEBHOOK_SIGNING_SECRET }),
    ]);
  }
}

export const channelAdapterRegistry = ChannelAdapterRegistry.createDefault();
