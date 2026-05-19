import { describe, expect, it } from 'vitest';
import { resolveAgentBaseUrl } from './agentApi';
describe('agentApi', () => {
    it('uses the configured local HTTP agent URL during local development', async () => {
        expect(resolveAgentBaseUrl('http://localhost:3001', 'http:', 'http://localhost:5173')).toBe('http://localhost:3001');
    });
    it('falls back to same-origin HTTPS when configured agent URL is insecure', async () => {
        expect(resolveAgentBaseUrl('http://46.62.218.169:3001', 'https:', 'https://aizelyan.duckdns.org')).toBe('https://aizelyan.duckdns.org');
    });
    it('preserves configured subpaths when falling back to same-origin HTTPS', async () => {
        expect(resolveAgentBaseUrl('http://46.62.218.169:3001/agent/', 'https:', 'https://aizelyan.duckdns.org')).toBe('https://aizelyan.duckdns.org/agent');
    });
    it('uses the same-origin agent subpath when the default local URL reaches production HTTPS', async () => {
        expect(resolveAgentBaseUrl('http://localhost:3001', 'https:', 'https://aizelyan.duckdns.org')).toBe('https://aizelyan.duckdns.org/agent');
    });
    it('keeps explicitly configured HTTPS agent URLs', async () => {
        expect(resolveAgentBaseUrl('https://api.example.com/', 'https:', 'https://aizelyan.duckdns.org')).toBe('https://api.example.com');
    });
});
//# sourceMappingURL=agentApi.spec.js.map