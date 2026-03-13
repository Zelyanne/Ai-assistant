import { BaseProcessor, ProcessorResult } from './BaseProcessor.js';
import { Task } from '@ai-assistant/shared';
import { supabase } from '../services/supabase.js';
import { mcpService } from '../services/mcp.js';

interface EmailSendPayload {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  body_format?: string;
  thread_external_id?: string;
  thread_id?: string;
  in_reply_to?: string;
  references?: string;
  approved_by?: string;
  approved_at?: string;
  source_task_id?: string;
}

function encodeRawEmail(payload: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}): string {
  return Buffer.from(
    `To: ${payload.to}\r\n` +
      `${payload.cc ? `Cc: ${payload.cc}\r\n` : ''}` +
      `${payload.bcc ? `Bcc: ${payload.bcc}\r\n` : ''}` +
      `Subject: ${payload.subject}\r\n\r\n` +
      `${payload.body}`,
    'utf-8',
  ).toString('base64');
}

function extractMessageId(rawResult: unknown): string | null {
  const asText = JSON.stringify(rawResult);
  const match = asText.match(/Message ID:\s*<?([^>\s"]+)>?/i);
  return match?.[1] ?? null;
}

function isSendToolUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('unknown tool') ||
    message.includes('tool not found') ||
    message.includes('not found') ||
    message.includes('send_gmail_message')
  );
}

export class EmailSendProcessor extends BaseProcessor {
  async process(task: Task): Promise<ProcessorResult> {
    console.log(`[EmailSendProcessor][${task.id}] Processing email.send...`);

    const payload = (task.payload ?? {}) as EmailSendPayload;
    const approvedBy = payload.approved_by;
    const approvedAt = payload.approved_at;

    if (!approvedBy || !approvedAt) {
      throw new Error('APPROVAL_REQUIRED: Approval metadata is missing.');
    }

    const { data: ownerRow, error: ownerError } = await supabase
      .from('workspace_integrations')
      .select('user_id')
      .eq('organization_id', task.organization_id)
      .eq('provider', 'google')
      .maybeSingle();

    if (ownerError) {
      throw new Error(`APPROVAL_LOOKUP_FAILED: ${ownerError.message}`);
    }

    const integrationOwnerId = ownerRow?.user_id ?? null;

    if (!integrationOwnerId) {
      throw new Error('APPROVER_NOT_CONFIGURED: Google Workspace owner is not configured for this org.');
    }

    if (approvedBy !== integrationOwnerId) {
      throw new Error('APPROVER_MISMATCH: Only the Gmail integration owner can approve/send.');
    }

    const to = payload.to?.trim() ?? '';
    const subject = payload.subject?.trim() ?? '';
    const body = payload.body?.trim() ?? '';

    if (!to || !subject || !body) {
      throw new Error('APPROVAL_DRAFT_INVALID: Draft is missing required fields (to, subject, body).');
    }

    const normalizedBodyFormat = payload.body_format === 'html' ? 'html' : 'plain';

    try {
      const { toolName, result: sendResult } = await mcpService.executeWorkerTool(
        task.organization_id,
        'gmail',
        'send_gmail_message',
        {
          to,
          cc: payload.cc,
          bcc: payload.bcc,
          subject,
          body,
          body_format: normalizedBodyFormat,
          thread_id: payload.thread_external_id,
          in_reply_to: payload.in_reply_to,
          references: payload.references,
        },
      );

      const messageId = extractMessageId(sendResult);

      return {
        summary: 'Email sent via MCP.',
        send_status: 'sent',
        tool_name: toolName,
        message_id: messageId,
        source_task_id: payload.source_task_id,
        approved_by: approvedBy,
        approved_at: approvedAt,
        raw_result: sendResult,
      };
    } catch (error: unknown) {
      if (!isSendToolUnavailableError(error)) {
        throw error;
      }

      const draftResolution = await mcpService.resolveToolName(
        task.organization_id,
        'create_gmail_draft',
      );
      const draftToolName = draftResolution.resolvedTool ?? 'create_gmail_draft';
      const draftArgs = draftToolName === 'draft_gmail_message'
        ? {
            to,
            cc: payload.cc,
            bcc: payload.bcc,
            subject,
            body,
            body_format: normalizedBodyFormat,
            thread_id: payload.thread_external_id,
          }
        : {
            userId: 'me',
            draft: {
              message: {
                raw: encodeRawEmail({
                  to,
                  cc: payload.cc,
                  bcc: payload.bcc,
                  subject,
                  body,
                }),
              },
            },
          };

      const { toolName, result: draftResult } = await mcpService.executeWorkerTool(
        task.organization_id,
        'gmail',
        'create_gmail_draft',
        draftArgs,
      );

      return {
        summary: 'Send tool unavailable. Gmail draft created; manual send required.',
        send_status: 'draft_created',
        tool_name: toolName,
        source_task_id: payload.source_task_id,
        approved_by: approvedBy,
        approved_at: approvedAt,
        raw_result: draftResult,
      };
    }
  }
}
