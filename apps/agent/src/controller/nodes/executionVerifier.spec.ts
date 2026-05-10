import { describe, expect, it } from 'vitest';
import { verifyAgentToolResults } from './executionVerifier.js';
import type { AgentToolResult } from './types.js';

function completedResult(overrides: Partial<AgentToolResult> = {}): AgentToolResult {
  return {
    agent: 'docs',
    status: 'completed',
    summary: 'Doc created.',
    handoff_content: 'Doc handoff.',
    artifacts: { document_id: 'doc-1' },
    tool_invocations: [{ tool_name: 'create_doc' }],
    ...overrides,
  };
}

describe('verifyAgentToolResults', () => {
  it('passes when specialist results include handoff and execution evidence', () => {
    const result = verifyAgentToolResults([
      completedResult(),
      completedResult({ agent: 'gmail', summary: 'Email drafted.', handoff_content: 'Draft handoff.' }),
    ]);

    expect(result.status).toBe('passed');
    expect(result.summary).toContain('2 specialist-agent results');
  });

  it('fails when a specialist returns an incomplete status', () => {
    const result = verifyAgentToolResults([
      completedResult({
        agent: 'gmail',
        status: 'needs_confirmation',
        summary: 'Needs confirmation.',
        next_prompt: 'Ask for confirmation.',
      }),
    ]);

    expect(result.status).toBe('failed');
    expect(result.repair_prompt).toBe('Ask for confirmation.');
  });

  it('fails when handoff_content is missing', () => {
    const result = verifyAgentToolResults([completedResult({ handoff_content: '' })]);

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('handoff_content');
  });

  it('fails when no artifact or tool invocation evidence is present', () => {
    const result = verifyAgentToolResults([completedResult({ artifacts: {}, tool_invocations: [] })]);

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('artifact or tool invocation');
  });

  it('fails safely when invocation metadata is malformed', () => {
    const malformed = {
      agent: 'docs',
      status: 'completed',
      summary: 'Doc created.',
      handoff_content: 'Doc handoff.',
      artifacts: {},
    } as AgentToolResult;

    const result = verifyAgentToolResults([malformed]);

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('artifact or tool invocation');
  });

  it('does not count support-only tools as execution evidence', () => {
    const result = verifyAgentToolResults([
      completedResult({ artifacts: {}, tool_invocations: [{ tool_name: 'search_web_research' }] }),
    ]);

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('artifact or tool invocation');
  });

  it('fails when the original request implies a missing specialist', () => {
    const result = verifyAgentToolResults([completedResult()], {
      originalCommand: 'Create a Google Doc and email it to John.',
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('gmail');
  });

  it('does not require docs again when sending an already prepared Google Docs report draft', () => {
    const result = verifyAgentToolResults([
      completedResult({
        agent: 'gmail',
        summary: 'Email sent.',
        handoff_content: 'Sent the existing Benin report draft to othily.g@gmail.com.',
        artifacts: { message_id: 'msg-1' },
        tool_invocations: [{ tool_name: 'send_gmail_message' }],
      }),
    ], {
      originalCommand: 'It is still in draft mode; send the previously prepared Google Docs report message to othily.g@gmail.com.',
    });

    expect(result.status).toBe('passed');
  });
});
