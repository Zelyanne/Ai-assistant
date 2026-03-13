import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WhatsAppAdapter } from './WhatsAppAdapter.js';
import { OutboundChannelMessage } from '@ai-assistant/shared';

describe('WhatsAppAdapter Integration', () => {
  const options = {
    whatsapp_api_key: 'meta-api-key',
    whatsapp_phone_number_id: 'meta-phone-id',
    twilio_account_sid: 'twilio-sid',
    twilio_auth_token: 'twilio-token',
    twilio_whatsapp_phone_number: 'whatsapp:+15551234567',
  };

  const adapter = new WhatsAppAdapter(options);

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('Outbound via Meta Cloud API', () => {
    it('sends a message successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '1234567890', wa_id: '1234567890' }],
          messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MBVDRS' }],
        }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const message: OutboundChannelMessage = {
        channel: 'whatsapp',
        organization_id: '11111111-1111-1111-1111-111111111111',
        external_message_id: 'ext-123',
        thread_id: '1234567890',
        message_text: 'Hello from Meta',
        channel_metadata: {},
      };

      const result = await adapter.sendOutbound(message);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('meta-phone-id/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer meta-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('Hello from Meta'),
        })
      );

      expect(result.delivery_state).toBe('sent');
      expect(result.provider_message_id).toBe('wamid.HBgLMTIzNDU2Nzg5MBVDRS');
    });

    it('handles Meta API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid parameter',
            type: 'OAuthException',
            code: 100,
          },
        }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const message: OutboundChannelMessage = {
        channel: 'whatsapp',
        organization_id: '11111111-1111-1111-1111-111111111111',
        external_message_id: 'ext-123',
        thread_id: '1234567890',
        message_text: 'Hello Error',
        channel_metadata: {},
      };

      const result = await adapter.sendOutbound(message);

      expect(result.delivery_state).toBe('failed');
      expect(result.error_message).toBe('Invalid parameter');
      expect(result.terminal).toBe(true);
    });
  });

  describe('Outbound via Twilio', () => {
    it('sends a message successfully when Meta is not configured', async () => {
      const twilioOnlyAdapter = new WhatsAppAdapter({
        twilio_account_sid: 'twilio-sid',
        twilio_auth_token: 'twilio-token',
        twilio_whatsapp_phone_number: 'whatsapp:+15551234567',
      });

      const mockResponse = {
        ok: true,
        status: 201,
        json: async () => ({
          sid: 'SM-TWILIO-SID',
          status: 'queued',
        }),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const message: OutboundChannelMessage = {
        channel: 'whatsapp',
        organization_id: '11111111-1111-1111-1111-111111111111',
        external_message_id: 'ext-123',
        thread_id: '9876543210',
        message_text: 'Hello from Twilio',
        channel_metadata: {},
      };

      const result = await twilioOnlyAdapter.sendOutbound(message);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('twilio-sid/Messages.json'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );

      expect(result.delivery_state).toBe('sent');
      expect(result.provider_message_id).toBe('SM-TWILIO-SID');
    });
  });

  describe('Inbound / Webhook Normalization', () => {
    it('normalizes Meta nested webhook format', () => {
      const metaPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: 'meta-phone-id' },
              contacts: [{ profile: { name: 'Alexis' }, wa_id: '1234567890' }],
              messages: [{
                from: '1234567890',
                id: 'wamid.123',
                timestamp: '1600000000',
                text: { body: 'Ping' },
                type: 'text'
              }]
            },
            field: 'messages'
          }]
        }],
        organization_id: '11111111-1111-1111-1111-111111111111'
      };

      const normalized = adapter.normalizeInbound(metaPayload);

      expect(normalized.channel).toBe('whatsapp');
      expect(normalized.message_text).toBe('Ping');
      expect(normalized.thread_id).toBe('1234567890');
      expect(normalized.channel_metadata.profile_name).toBe('Alexis');
    });

    it('normalizes Meta status update', () => {
      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              statuses: [{
                id: 'wamid.123',
                status: 'delivered',
                timestamp: '1600000000',
                recipient_id: '1234567890'
              }]
            },
            field: 'messages'
          }]
        }],
        organization_id: '11111111-1111-1111-1111-111111111111',
        task_id: '33333333-3333-4333-8333-333333333333'
      };

      const event = adapter.mapDeliveryEvent(statusPayload);

      expect(event).not.toBeNull();
      expect(event?.delivery_state).toBe('delivered');
      expect(event?.provider_message_id).toBe('wamid.123');
      expect(event?.terminal).toBe(true);
    });
  });
});
