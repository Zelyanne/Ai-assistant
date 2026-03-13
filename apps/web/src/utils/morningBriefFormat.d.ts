export interface FormattedMorningBriefNarrative {
    narrativeHtml: string;
    sourceIds: string[];
}
export declare function maskSourceId(id: string): string;
export declare function formatMorningBriefNarrative(summaryText: string, metadata?: unknown): FormattedMorningBriefNarrative;
