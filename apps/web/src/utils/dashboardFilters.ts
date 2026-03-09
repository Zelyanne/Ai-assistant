export interface DashboardFilterItem {
  type: 'task' | 'thread';
  domainAction?: string;
  topics?: string[];
}

export function hasNormalizedBlockerSignal(item: DashboardFilterItem): boolean {
  if (item.type !== 'task' || item.domainAction !== 'relancing.update') {
    return false;
  }

  return item.topics?.includes('Blocker') === true;
}

export function hasRiskSignal(topics?: string[]): boolean {
  return topics?.some((topic) => {
    const normalized = topic.toLowerCase();
    return normalized.includes('risk') || normalized.includes('deadline');
  }) ?? false;
}
