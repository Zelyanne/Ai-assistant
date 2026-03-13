export function hasNormalizedBlockerSignal(item) {
    if (item.type !== 'task' || item.domainAction !== 'relancing.update') {
        return false;
    }
    return item.topics?.includes('Blocker') === true;
}
export function hasRiskSignal(topics) {
    return topics?.some((topic) => {
        const normalized = topic.toLowerCase();
        return normalized.includes('risk') || normalized.includes('deadline');
    }) ?? false;
}
//# sourceMappingURL=dashboardFilters.js.map