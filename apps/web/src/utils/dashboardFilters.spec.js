import { describe, expect, it } from 'vitest';
import { hasNormalizedBlockerSignal, hasRiskSignal } from './dashboardFilters';
describe('dashboardFilters', () => {
    it('counts only normalized relancing blocker signals as blockers', () => {
        expect(hasNormalizedBlockerSignal({ type: 'task', domainAction: 'relancing.update', topics: ['Blocker'] })).toBe(true);
        expect(hasNormalizedBlockerSignal({ type: 'task', domainAction: 'email.draft', topics: ['Blocker'] })).toBe(false);
        expect(hasNormalizedBlockerSignal({ type: 'task', domainAction: 'thread.action', topics: ['Urgent'] })).toBe(false);
        expect(hasNormalizedBlockerSignal({ type: 'thread', topics: ['Blocker'] })).toBe(false);
    });
    it('detects risk topics from normalized labels', () => {
        expect(hasRiskSignal(['Deadline slip', 'Finance'])).toBe(true);
        expect(hasRiskSignal(['Risk', 'Ops'])).toBe(true);
        expect(hasRiskSignal(['Blocker', 'Status update'])).toBe(false);
    });
});
//# sourceMappingURL=dashboardFilters.spec.js.map