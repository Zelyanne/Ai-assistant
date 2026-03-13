export interface DashboardFilterItem {
    type: 'task' | 'thread';
    domainAction?: string;
    topics?: string[];
}
export declare function hasNormalizedBlockerSignal(item: DashboardFilterItem): boolean;
export declare function hasRiskSignal(topics?: string[]): boolean;
