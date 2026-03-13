import { describe, it, expect } from 'vitest';
import { formatMorningBriefNarrative } from './morningBriefFormat';
describe('morningBriefFormat', () => {
    it('escapes HTML-like input to prevent injection', () => {
        const input = "Good morning. <script>alert('x')</script>";
        const { narrativeHtml } = formatMorningBriefNarrative(input);
        expect(narrativeHtml).toContain('&lt;script&gt;');
        expect(narrativeHtml).toContain('alert');
        expect(narrativeHtml).not.toContain('<script>');
    });
    it('extracts UUIDs from text when metadata is missing and strips them from prose', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        const input = `BLUF sentence.\n\nDetail paragraph mentioning ${uuid} inline.`;
        const out = formatMorningBriefNarrative(input);
        expect(out.sourceIds).toEqual([uuid]);
        expect(out.narrativeHtml).not.toContain(uuid);
    });
    it('prefers metadata.source_ids when present and normalizes malformed values', () => {
        const uuid1 = '123e4567-e89b-12d3-a456-426614174000';
        const uuid2 = '123e4567-e89b-12d3-a456-426614174001';
        const metadata = {
            source_ids: [uuid1, 123, uuid2, uuid1, 'not-a-uuid', null],
        };
        const out = formatMorningBriefNarrative('BLUF.\n\nBody.', metadata);
        expect(out.sourceIds).toEqual([uuid1, uuid2]);
    });
    it('produces only allowed tags in narrativeHtml', () => {
        const out = formatMorningBriefNarrative('BLUF.\n\nBody paragraph.');
        const html = out.narrativeHtml;
        // Only div.bluf-box and p tags should exist.
        expect(html).toMatch(/^([\s\S]*<div class="bluf-box">[\s\S]*<\/div>)?([\s\S]*<p>[\s\S]*<\/p>)*[\s\S]*$/);
        expect(html).not.toContain('<section');
        expect(html).not.toContain('<span');
    });
});
//# sourceMappingURL=morningBriefFormat.spec.js.map