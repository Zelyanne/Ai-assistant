import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  DeliveryEventEnvelope,
  DeliveryEventEnvelopeSchema,
  NormalizedInboundEnvelope,
  NormalizedInboundEnvelopeSchema,
  OutboundChannelMessage,
} from '@ai-assistant/shared';
import { ChannelAdapter, OutboundSendResult, WebhookValidationInput, WebhookValidationResult } from './ChannelAdapter.js';
import { evaluateBoundedRetryPolicy } from './retryPolicy.js';

const WHATSAPP_SIGNATURE_HEADER = 'x-whatsapp-signature';
const TWILIO_SIGNATURE_HEADER = 'x-twilio-signature';
const EVOLUTION_WEBHOOK_SECRET_HEADERS = ['x-evolution-webhook-secret', 'x-webhook-secret'] as const;
const EVOLUTION_INBOUND_EVENT = 'messages.upsert';
const EVOLUTION_DELIVERY_EVENTS = new Set(['send.message', 'send.message.update', 'messages.update']);

const WhatsAppWebhookSchema = z.object({
  organization_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  MessageSid: z.string().optional(),
  SmsMessageSid: z.string().optional(),
  SmsSid: z.string().optional(),
  Body: z.string().optional(),
  WaId: z.string().optional(),
  From: z.string().optional(),
  To: z.string().optional(),
  ProfileName: z.string().optional(),
  MessageStatus: z.string().optional(),
  SmsStatus: z.string().optional(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
  thread_id: z.string().optional(),
  external_message_id: z.string().optional(),
  correlation_id: z.string().optional(),
  topic: z.string().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/).optional(),
}).passthrough();

const EvolutionWebhookSchema = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  destination: z.string().optional(),
  date_time: z.union([z.string(), z.number()]).optional(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
  organization_id: z.string().uuid().optional(),
  user_id: z.string().uuid().nullable().optional(),
  task_id: z.string().uuid().optional(),
  correlation_id: z.string().optional(),
  topic: z.string().optional(),
  domain_action: z.string().regex(/^[a-z]+\.[a-z]+$/).optional(),
}).passthrough();

type WhatsAppProvider = 'auto' | 'evolution' | 'meta' | 'twilio';

interface WhatsAppAdapterOptions {
  whatsapp_provider?: string;
  webhook_signing_secret?: string;
  evolution_webhook_secret?: string;
  evolution_api_base_url?: string;
  evolution_api_key?: string;
  evolution_instance_name?: string;
  whatsapp_api_key?: string;
  whatsapp_phone_number_id?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_whatsapp_phone_number?: string;
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function timingSafeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeProvider(value: string | undefined): WhatsAppProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'evolution' || normalized === 'meta' || normalized === 'twilio') {
    return normalized;
  }
  return null;
}

function resolveEvolutionWebhookSecret(headers: Record<string, string | string[] | undefined>): string | undefined {
  for (const header of EVOLUTION_WEBHOOK_SECRET_HEADERS) {
    const value = headerValue(headers, header);
    if (value) {
      return value;
    }
  }

  const authorization = headerValue(headers, 'authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  return undefined;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalizedValue = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(normalizedValue).toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return normalizeTimestamp(numeric);
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeRemoteJid(value: unknown, alternateValue: unknown): string | undefined {
  const remoteJid = readString(value);
  const remoteJidAlt = readString(alternateValue);
  if (!remoteJid) {
    return remoteJidAlt;
  }

  if (remoteJid.includes('@lid') && remoteJidAlt) {
    return remoteJidAlt;
  }

  return remoteJid;
}

function normalizePhoneLikeIdentifier(value: string): string {
  const withoutPrefix = value.replace(/^whatsapp:/, '');
  if (withoutPrefix.endsWith('@g.us')) {
    return withoutPrefix;
  }

  if (withoutPrefix.endsWith('@s.whatsapp.net') || withoutPrefix.endsWith('@c.us')) {
    return withoutPrefix.split('@')[0] ?? withoutPrefix;
  }

  if (/^\+\d+$/.test(withoutPrefix)) {
    return withoutPrefix.slice(1);
  }

  const digitsOnly = withoutPrefix.replace(/[^\d]/g, '');
  return digitsOnly.length > 0 ? digitsOnly : withoutPrefix;
}

function normalizeTwilioRecipient(threadId: string): string {
  if (threadId.startsWith('whatsapp:')) {
    return threadId;
  }

  const normalized = normalizePhoneLikeIdentifier(threadId);
  const twilioTarget = normalized.startsWith('+') ? normalized : `+${normalized}`;
  return `whatsapp:${twilioTarget}`;
}

function extractMessageText(payload: Record<string, unknown>): string | undefined {
  const directText = readString(payload.text);
  if (directText) {
    return directText;
  }

  const message = asRecord(payload.message);
  const extendedTextMessage = asRecord(message.extendedTextMessage);
  const imageMessage = asRecord(message.imageMessage);
  const videoMessage = asRecord(message.videoMessage);
  const documentMessage = asRecord(message.documentMessage);
  const buttonsResponseMessage = asRecord(message.buttonsResponseMessage);
  const templateButtonReplyMessage = asRecord(message.templateButtonReplyMessage);
  const listResponseMessage = asRecord(message.listResponseMessage);
  const singleSelectReply = asRecord(listResponseMessage.singleSelectReply);
  const reactionMessage = asRecord(message.reactionMessage);
  const documentWithCaptionMessage = asRecord(message.documentWithCaptionMessage);
  const documentWithCaptionMessageInner = asRecord(documentWithCaptionMessage.message);
  const documentWithCaption = asRecord(documentWithCaptionMessageInner.documentMessage);

  return readString(message.conversation)
    ?? readString(extendedTextMessage.text)
    ?? readString(message.speechToText)
    ?? readString(buttonsResponseMessage.selectedDisplayText)
    ?? readString(buttonsResponseMessage.selectedButtonId)
    ?? readString(templateButtonReplyMessage.selectedId)
    ?? readString(listResponseMessage.title)
    ?? readString(singleSelectReply.selectedRowId)
    ?? readString(reactionMessage.text)
    ?? readString(imageMessage.caption)
    ?? readString(videoMessage.caption)
    ?? readString(documentMessage.caption)
    ?? readString(documentWithCaption.caption);
}

function extractProviderMessageId(value: Record<string, unknown>): string | undefined {
  const key = asRecord(value.key);
  return readString(key.id)
    ?? readString(value.id)
    ?? readString(value.keyId)
    ?? readString(value.messageId);
}

function readDeliveryStatus(value: Record<string, unknown>): unknown {
  const update = asRecord(value.update);
  return value.status
    ?? value.messageStatus
    ?? value.ack
    ?? update.status
    ?? update.ack;
}

function mapEvolutionDeliveryState(status: unknown): 'queued' | 'sent' | 'delivered' | 'failed' {
  if (typeof status === 'number' && Number.isFinite(status)) {
    if (status <= 0) {
      return 'failed';
    }
    if (status === 1) {
      return 'queued';
    }
    if (status === 2) {
      return 'sent';
    }
    return 'delivered';
  }

  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!normalized) {
    return 'queued';
  }

  if (['error', 'failed', 'failure', 'not_found', 'undelivered'].includes(normalized)) {
    return 'failed';
  }

  if (['server_ack', 'sent', 'ack', 'success', 'pending'].includes(normalized)) {
    return normalized === 'pending' ? 'queued' : 'sent';
  }

  if (['delivery_ack', 'delivered', 'read', 'played'].includes(normalized)) {
    return 'delivered';
  }

  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return mapEvolutionDeliveryState(numeric);
  }

  return 'queued';
}

function extractErrorCode(value: Record<string, unknown>): string | undefined {
  const error = asRecord(value.error);
  return readString(value.error_code)
    ?? readString(value.errorCode)
    ?? readString(error.code);
}

function extractErrorMessage(value: Record<string, unknown>): string | undefined {
  const error = asRecord(value.error);
  return readString(value.error_message)
    ?? readString(value.errorMessage)
    ?? readString(error.message);
}

function twilioParamString(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) {
        const sortedValues = [...value].map((entry) => String(entry)).sort();
        return sortedValues.map((entry) => `${key}${entry}`).join('');
      }

      if (value === null || typeof value === 'undefined') {
        return '';
      }

      return `${key}${String(value)}`;
    })
    .join('');
}

function expectedTwilioSignature(secret: string, requestPath: string, body: Record<string, unknown>): string {
  const toSign = `${requestPath}${twilioParamString(body)}`;
  return createHmac('sha1', secret).update(Buffer.from(toSign, 'utf-8')).digest('base64');
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { data: parsed };
  } catch {
    return { raw: text };
  }
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;
  private readonly whatsappProvider: WhatsAppProvider;
  private readonly webhookSigningSecret?: string;
  private readonly evolutionWebhookSecret?: string;
  private readonly evolutionApiBaseUrl?: string;
  private readonly evolutionApiKey?: string;
  private readonly evolutionInstanceName?: string;
  private readonly whatsappApiKey?: string;
  private readonly whatsappPhoneNumberId?: string;
  private readonly twilioAccountSid?: string;
  private readonly twilioAuthToken?: string;
  private readonly twilioWhatsappPhoneNumber?: string;

  constructor(options: WhatsAppAdapterOptions = {}) {
    this.whatsappProvider = normalizeProvider(options.whatsapp_provider) ?? 'auto';
    this.webhookSigningSecret = options.webhook_signing_secret;
    this.evolutionWebhookSecret = options.evolution_webhook_secret;
    this.evolutionApiBaseUrl = options.evolution_api_base_url;
    this.evolutionApiKey = options.evolution_api_key;
    this.evolutionInstanceName = options.evolution_instance_name;
    this.whatsappApiKey = options.whatsapp_api_key;
    this.whatsappPhoneNumberId = options.whatsapp_phone_number_id;
    this.twilioAccountSid = options.twilio_account_sid;
    this.twilioAuthToken = options.twilio_auth_token;
    this.twilioWhatsappPhoneNumber = options.twilio_whatsapp_phone_number;
  }

  private hasEvolutionConfig(): boolean {
    return Boolean(this.evolutionApiBaseUrl && this.evolutionApiKey && this.evolutionInstanceName);
  }

  private hasMetaConfig(): boolean {
    return Boolean(this.whatsappApiKey && this.whatsappPhoneNumberId);
  }

  private hasTwilioConfig(): boolean {
    return Boolean(this.twilioAccountSid && this.twilioAuthToken && this.twilioWhatsappPhoneNumber);
  }

  private resolveOutboundProvider(message: OutboundChannelMessage): Exclude<WhatsAppProvider, 'auto'> | null {
    const providerPayload = asRecord(message.provider_payload);
    const channelMetadata = asRecord(message.channel_metadata);
    const override = normalizeProvider(
      readString(providerPayload.provider) ?? readString(channelMetadata.provider),
    );

    if (override && override !== 'auto') {
      return override;
    }

    if (this.whatsappProvider !== 'auto') {
      return this.whatsappProvider;
    }

    if (this.hasEvolutionConfig()) {
      return 'evolution';
    }

    if (this.hasMetaConfig()) {
      return 'meta';
    }

    if (this.hasTwilioConfig()) {
      return 'twilio';
    }

    return null;
  }

  validateWebhook(input: WebhookValidationInput): WebhookValidationResult {
    const evolutionSecret = resolveEvolutionWebhookSecret(input.headers);
    if (evolutionSecret) {
      if (!this.evolutionWebhookSecret) {
        return { valid: false, reason: 'evolution_webhook_secret_not_configured' };
      }

      if (timingSafeCompare(evolutionSecret, this.evolutionWebhookSecret)) {
        return { valid: true };
      }

      return { valid: false, reason: 'evolution_webhook_secret_mismatch' };
    }

    if (!this.webhookSigningSecret) {
      return { valid: false, reason: 'whatsapp_webhook_secret_not_configured' };
    }

    const whatsappSignature = headerValue(input.headers, WHATSAPP_SIGNATURE_HEADER);
    if (whatsappSignature) {
      const expectedSignature = createHmac('sha256', this.webhookSigningSecret)
        .update(Buffer.from(input.rawBody, 'utf-8'))
        .digest('hex');

      if (timingSafeCompare(expectedSignature, whatsappSignature)) {
        return { valid: true };
      }

      return { valid: false, reason: 'whatsapp_signature_mismatch' };
    }

    const twilioSignature = headerValue(input.headers, TWILIO_SIGNATURE_HEADER);
    if (twilioSignature && input.requestPath && input.parsedBody && typeof input.parsedBody === 'object') {
      const expectedSignature = expectedTwilioSignature(
        this.webhookSigningSecret,
        input.requestPath,
        input.parsedBody as Record<string, unknown>,
      );

      if (timingSafeCompare(expectedSignature, twilioSignature)) {
        return { valid: true };
      }

      return { valid: false, reason: 'twilio_signature_mismatch' };
    }

    return { valid: false, reason: 'whatsapp_signature_header_missing' };
  }

  normalizeInbound(payload: unknown): NormalizedInboundEnvelope {
    const body = payload as Record<string, unknown>;

    if (body?.object === 'whatsapp_business_account' && Array.isArray((body as any).entry)) {
      const value = (body as any).entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];
      const contact = value?.contacts?.[0];

      if (!message) {
        throw new Error('No message found in Meta WhatsApp webhook');
      }

      return NormalizedInboundEnvelopeSchema.parse({
        channel: this.channel,
        organization_id: body.organization_id,
        user_id: body.user_id ?? null,
        external_message_id: message.id,
        thread_id: message.from,
        domain_action: body.domain_action ?? 'thread.action',
        topic: body.topic,
        message_text: message.text?.body,
        channel_metadata: {
          from: message.from,
          wa_id: contact?.wa_id,
          profile_name: contact?.profile?.name,
          timestamp: normalizeTimestamp(message.timestamp),
          provider: 'meta',
          meta_payload: body,
        },
        raw_payload: body,
        correlation_id: body.correlation_id,
      });
    }

    const evolutionCandidate = EvolutionWebhookSchema.safeParse(payload);
    if (evolutionCandidate.success && evolutionCandidate.data.event) {
      const parsed = evolutionCandidate.data;
      if (parsed.event !== EVOLUTION_INBOUND_EVENT) {
        throw new Error(`Unsupported Evolution WhatsApp inbound event: ${parsed.event}`);
      }

      if (!parsed.organization_id) {
        throw new Error('organization_id is required for whatsapp webhook routing');
      }

      const data = asRecord(parsed.data);
      const key = asRecord(data.key);
      const threadId = normalizeRemoteJid(key.remoteJid, key.remoteJidAlt);
      const externalMessageId = extractProviderMessageId(data);

      if (!threadId || !externalMessageId) {
        throw new Error('Evolution WhatsApp inbound payload is missing key metadata');
      }

      return NormalizedInboundEnvelopeSchema.parse({
        channel: this.channel,
        organization_id: parsed.organization_id,
        user_id: parsed.user_id ?? null,
        external_message_id: externalMessageId,
        thread_id: threadId,
        domain_action: parsed.domain_action ?? 'thread.action',
        topic: parsed.topic,
        message_text: extractMessageText(data),
        channel_metadata: {
          event: parsed.event,
          instance: parsed.instance,
          from_me: key.fromMe === true,
          push_name: readString(data.pushName),
          remote_jid: threadId,
          participant: readString(key.participant),
          sender: parsed.sender,
          timestamp: normalizeTimestamp((data as Record<string, unknown>).messageTimestamp ?? parsed.date_time),
          provider: 'evolution',
        },
        raw_payload: parsed,
        correlation_id: parsed.correlation_id,
      });
    }

    const parsed = WhatsAppWebhookSchema.parse(payload);
    const externalMessageId = parsed.external_message_id
      ?? parsed.MessageSid
      ?? parsed.SmsMessageSid
      ?? parsed.SmsSid
      ?? `whatsapp-${randomUUID()}`;

    const threadId = parsed.thread_id
      ?? parsed.WaId
      ?? parsed.From
      ?? `whatsapp-thread-${randomUUID()}`;

    return NormalizedInboundEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      user_id: parsed.user_id ?? null,
      external_message_id: externalMessageId,
      thread_id: threadId,
      domain_action: parsed.domain_action ?? 'thread.action',
      topic: parsed.topic,
      message_text: parsed.Body,
      channel_metadata: {
        from: parsed.From,
        to: parsed.To,
        wa_id: parsed.WaId,
        profile_name: parsed.ProfileName,
        provider: 'twilio',
      },
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  async sendOutbound(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    const provider = this.resolveOutboundProvider(message);

    if (provider === 'evolution') {
      if (!this.hasEvolutionConfig()) {
        return {
          delivery_state: 'failed',
          error_message: 'evolution_api_not_configured',
          provider_response: { error: 'Evolution API is not configured' },
          terminal: true,
        };
      }

      return this.sendViaEvolution(message);
    }

    if (provider === 'meta') {
      if (!this.hasMetaConfig()) {
        return {
          delivery_state: 'failed',
          error_message: 'whatsapp_meta_api_not_configured',
          provider_response: { error: 'Meta WhatsApp Cloud API is not configured' },
          terminal: true,
        };
      }

      return this.sendViaMeta(message);
    }

    if (provider === 'twilio') {
      if (!this.hasTwilioConfig()) {
        return {
          delivery_state: 'failed',
          error_message: 'whatsapp_twilio_not_configured',
          provider_response: { error: 'Twilio WhatsApp is not configured' },
          terminal: true,
        };
      }

      return this.sendViaTwilio(message);
    }

    return {
      delivery_state: 'failed',
      error_message: 'whatsapp_api_not_configured',
      provider_response: {
        error: 'No WhatsApp provider is configured. Supported providers: evolution, meta, twilio',
      },
      terminal: true,
    };
  }

  private async sendViaEvolution(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    const providerPayload = asRecord(message.provider_payload);
    const requestBody: Record<string, unknown> = {
      ...providerPayload,
      number: readString(providerPayload.number) ?? normalizePhoneLikeIdentifier(message.thread_id),
      text: readString(providerPayload.text) ?? message.message_text,
    };

    const url = `${stripTrailingSlash(this.evolutionApiBaseUrl!)}/message/sendText/${encodeURIComponent(this.evolutionInstanceName!)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: this.evolutionApiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        const isTerminal = response.status >= 400 && response.status < 500;
        return {
          delivery_state: 'failed',
          error_code: String(response.status),
          error_message: extractErrorMessage(data) ?? response.statusText,
          provider_response: data,
          terminal: isTerminal,
        };
      }

      return {
        delivery_state: 'sent',
        provider_message_id: extractProviderMessageId(data) ?? extractProviderMessageId(asRecord(data.data)),
        provider_response: data,
        terminal: false,
      };
    } catch (error) {
      return {
        delivery_state: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        provider_response: { error: error instanceof Error ? error.message : String(error) },
        terminal: false,
      };
    }
  }

  private async sendViaMeta(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    const url = `https://graph.facebook.com/v17.0/${this.whatsappPhoneNumberId}/messages`;
    const recipient = normalizePhoneLikeIdentifier(message.thread_id);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.whatsappApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { body: message.message_text },
        }),
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        const isTerminal = response.status >= 400 && response.status < 500;
        return {
          delivery_state: 'failed',
          error_code: String(response.status),
          error_message: readString(asRecord(data.error).message) ?? response.statusText,
          provider_response: data,
          terminal: isTerminal,
        };
      }

      const messages = (data as { messages?: unknown }).messages;
      const firstMessage = Array.isArray(messages) ? asRecord(messages[0]) : undefined;

      return {
        delivery_state: 'sent',
        provider_message_id: readString(firstMessage?.id),
        provider_response: data,
        terminal: false,
      };
    } catch (error) {
      return {
        delivery_state: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        provider_response: { error: String(error) },
        terminal: false,
      };
    }
  }

  private async sendViaTwilio(message: OutboundChannelMessage): Promise<OutboundSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;
    const from = this.twilioWhatsappPhoneNumber!.startsWith('whatsapp:')
      ? this.twilioWhatsappPhoneNumber
      : `whatsapp:${this.twilioWhatsappPhoneNumber}`;
    const to = normalizeTwilioRecipient(message.thread_id);

    const params = new URLSearchParams();
    params.append('From', from!);
    params.append('To', to);
    params.append('Body', message.message_text);

    const auth = Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        const isTerminal = response.status >= 400 && response.status < 500;
        return {
          delivery_state: 'failed',
          error_code: readString(data.code) ?? String(response.status),
          error_message: readString(data.message) ?? response.statusText,
          provider_response: data,
          terminal: isTerminal,
        };
      }

      return {
        delivery_state: 'sent',
        provider_message_id: readString(data.sid),
        provider_response: data,
        terminal: false,
      };
    } catch (error) {
      return {
        delivery_state: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        provider_response: { error: String(error) },
        terminal: false,
      };
    }
  }

  mapDeliveryEvent(payload: unknown): DeliveryEventEnvelope | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const body = payload as Record<string, unknown>;

    const evolutionCandidate = EvolutionWebhookSchema.safeParse(payload);
    if (evolutionCandidate.success && evolutionCandidate.data.event && EVOLUTION_DELIVERY_EVENTS.has(evolutionCandidate.data.event)) {
      const parsed = evolutionCandidate.data;
      if (!parsed.organization_id) {
        return null;
      }

      const data = asRecord(parsed.data);
      const key = asRecord(data.key);
      const providerMessageId = extractProviderMessageId(data);
      const threadId = normalizeRemoteJid(key.remoteJid, key.remoteJidAlt) ?? readString(data.number);

      if (!providerMessageId) {
        return null;
      }

      const status = parsed.event === 'send.message' ? 'sent' : readDeliveryStatus(data);
      const deliveryState = mapEvolutionDeliveryState(status);

      return DeliveryEventEnvelopeSchema.parse({
        channel: this.channel,
        organization_id: parsed.organization_id,
        task_id: parsed.task_id,
        external_message_id: providerMessageId,
        thread_id: threadId,
        provider_message_id: providerMessageId,
        delivery_state: deliveryState,
        occurred_at: normalizeTimestamp(parsed.date_time),
        attempt_count: 1,
        terminal: deliveryState === 'failed' || deliveryState === 'delivered',
        error_code: extractErrorCode(data),
        error_message: extractErrorMessage(data),
        channel_metadata: {
          event: parsed.event,
          instance: parsed.instance,
          remote_jid: threadId,
          status: typeof status === 'number' || typeof status === 'string' ? status : undefined,
          provider: 'evolution',
        },
        raw_payload: parsed,
        correlation_id: parsed.correlation_id,
      });
    }

    if (body.object === 'whatsapp_business_account' && (body as any).entry?.[0]?.changes?.[0]?.value?.statuses) {
      const statusObj = (body as any).entry[0].changes[0].value.statuses[0];
      const messageStatus = String(statusObj.status ?? '').toLowerCase();

      const deliveryState = messageStatus === 'sent'
        ? 'sent'
        : messageStatus === 'delivered' || messageStatus === 'read'
          ? 'delivered'
          : messageStatus === 'failed'
            ? 'failed'
            : 'queued';

      const firstError = Array.isArray(statusObj.errors) ? statusObj.errors[0] as Record<string, unknown> | undefined : undefined;

      return DeliveryEventEnvelopeSchema.parse({
        channel: this.channel,
        organization_id: body.organization_id,
        task_id: typeof body.task_id === 'string' ? body.task_id : undefined,
        external_message_id: statusObj.id,
        thread_id: statusObj.recipient_id,
        provider_message_id: statusObj.id,
        delivery_state: deliveryState,
        occurred_at: normalizeTimestamp(statusObj.timestamp),
        attempt_count: 1,
        terminal: deliveryState === 'failed' || deliveryState === 'delivered',
        error_code: readString(firstError?.code),
        error_message: readString(firstError?.message),
        channel_metadata: {
          status: messageStatus,
          recipient_id: statusObj.recipient_id,
          provider: 'meta',
          meta_payload: body,
        },
        raw_payload: body,
        correlation_id: typeof body.correlation_id === 'string' ? body.correlation_id : undefined,
      });
    }

    const parsed = WhatsAppWebhookSchema.parse(payload);
    const messageStatus = (parsed.MessageStatus ?? parsed.SmsStatus ?? '').toLowerCase();

    if (!messageStatus && !parsed.Body) {
      return null;
    }

    const deliveryState = messageStatus === 'sent'
      ? 'sent'
      : messageStatus === 'delivered' || messageStatus === 'read'
        ? 'delivered'
        : messageStatus === 'failed' || messageStatus === 'undelivered'
          ? 'failed'
          : 'queued';

    return DeliveryEventEnvelopeSchema.parse({
      channel: this.channel,
      organization_id: parsed.organization_id,
      task_id: typeof body.task_id === 'string' ? body.task_id : undefined,
      external_message_id: parsed.MessageSid ?? parsed.SmsMessageSid ?? parsed.SmsSid ?? parsed.external_message_id ?? `whatsapp-${randomUUID()}`,
      thread_id: parsed.thread_id ?? parsed.WaId ?? parsed.From,
      provider_message_id: parsed.MessageSid ?? parsed.SmsSid,
      delivery_state: deliveryState,
      occurred_at: new Date().toISOString(),
      attempt_count: 1,
      terminal: deliveryState === 'failed' || deliveryState === 'delivered',
      error_code: parsed.ErrorCode,
      error_message: parsed.ErrorMessage,
      channel_metadata: {
        from: parsed.From,
        to: parsed.To,
        wa_id: parsed.WaId,
        provider: 'twilio',
      },
      raw_payload: parsed,
      correlation_id: parsed.correlation_id,
    });
  }

  evaluateRetry(params: { attempt_count: number; max_attempts: number; error_message?: string }) {
    return evaluateBoundedRetryPolicy({
      attempt_count: params.attempt_count,
      max_attempts: params.max_attempts,
      error_message: params.error_message,
      base_delay_ms: 1_000,
      max_delay_ms: 60_000,
    });
  }
}
