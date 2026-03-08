import { describe, expect, it } from 'vitest';
import { channelAdapterRegistry } from './ChannelAdapterRegistry.js';

describe('ChannelAdapterRegistry', () => {
  it('registers all supported channel adapters', () => {
    expect(channelAdapterRegistry.has('web')).toBe(true);
    expect(channelAdapterRegistry.has('telegram')).toBe(true);
    expect(channelAdapterRegistry.has('whatsapp')).toBe(true);
  });

  it('returns adapters by channel', () => {
    const adapter = channelAdapterRegistry.get('telegram');
    expect(adapter.channel).toBe('telegram');
  });
});
