import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPService } from './mcp.js';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock other dependencies
vi.mock('../guards/PerimeterGuard.js', () => ({
  PerimeterGuard: vi.fn().mockImplementation(function() {
    return {
      redactPII: (text: string) => text
    };
  })
}));

vi.mock('../config/index.js', () => ({
  config: {
    ENCRYPTION_SECRET: '0123456789abcdef0123456789abcdef',
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret'
  }
}));

// Mock Supabase to avoid initialization errors
vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('MCPService Startup Logic', () => {
  let mockSpawn: ReturnType<typeof vi.mocked<typeof spawn>>;
  let mockStdout: EventEmitter;
  let mockStderr: EventEmitter;
  let mockChildProcess: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_MCP_STARTUP = 'true';

    mockStdout = new EventEmitter();
    mockStderr = new EventEmitter();
    mockChildProcess = new EventEmitter() as typeof mockChildProcess;
    mockChildProcess.stdout = mockStdout;
    mockChildProcess.stderr = mockStderr;
    mockChildProcess.kill = vi.fn();

    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockChildProcess as unknown as ChildProcess);
  });

  afterEach(() => {
    delete process.env.TEST_MCP_STARTUP;
  });

  it('resolves when "Ready for MCP connections" is logged', async () => {
    const service = new MCPService();
    
    // Simulate server output
    setTimeout(() => {
      mockStdout.emit('data', 'Some log info...');
      mockStdout.emit('data', '2026-01-29 10:00:00 [INFO] Ready for MCP connections on stdio');
    }, 10);

    await expect(service['serverReady']).resolves.toBeUndefined();
  });

  it('resolves when "Application startup complete" is logged (FastMCP pattern)', async () => {
    const service = new MCPService();
    
    setTimeout(() => {
      mockStdout.emit('data', 'Application startup complete.');
    }, 10);

    await expect(service['serverReady']).resolves.toBeUndefined();
  });

  it('rejects if the process exits before ready', async () => {
    const service = new MCPService();
    
    setTimeout(() => {
      mockChildProcess.emit('exit', 1, null);
    }, 10);

    await expect(service['serverReady']).rejects.toThrow(/exited with code 1/);
  });

  it('rejects on timeout (simulated)', async () => {
    vi.useFakeTimers();
    const service = new MCPService();
    
    // Fast-forward time
    vi.advanceTimersByTime(61000);

    await expect(service['serverReady']).rejects.toThrow(/timeout/);
    vi.useRealTimers();
  });

  it('retries startup once after a previous startup rejection', async () => {
    delete process.env.TEST_MCP_STARTUP;
    const service = new MCPService();
    process.env.TEST_MCP_STARTUP = 'true';
    const rejectedReady = Promise.reject(new Error('MCP server start timeout after 60 seconds'));
    rejectedReady.catch(() => undefined);
    service['serverReady'] = rejectedReady;
    mockSpawn.mockClear();

    const retryStdout = new EventEmitter();
    const retryStderr = new EventEmitter();
    const retryChildProcess = new EventEmitter() as typeof mockChildProcess;
    retryChildProcess.stdout = retryStdout;
    retryChildProcess.stderr = retryStderr;
    retryChildProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(retryChildProcess as unknown as ChildProcess);

    const retry = service['ensureServerReady']();
    setTimeout(() => {
      retryStdout.emit('data', 'Application startup complete.');
    }, 0);

    await expect(retry).resolves.toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
