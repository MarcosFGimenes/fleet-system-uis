import type { NonConformity } from "@/types/nonconformity";

export function matchesFilters(
  record: NonConformity,
  filters: {
    statuses: string[];
    severities: string[];
    assetId?: string;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  },
): boolean {
  if (filters.statuses.length && !filters.statuses.includes(record.status)) {
    return false;
  }

  if (filters.severities.length && (!record.severity || !filters.severities.includes(record.severity))) {
    return false;
  }

  if (filters.assetId) {
    if (record.linkedAsset.id !== filters.assetId && record.linkedAsset.tag !== filters.assetId) {
      return false;
    }
  }

  if (filters.dateFrom) {
    const createdAt = new Date(record.createdAt).getTime();
    if (Number.isNaN(createdAt) || createdAt < new Date(filters.dateFrom).getTime()) {
      return false;
    }
  }

  if (filters.dateTo) {
    const createdAt = new Date(record.createdAt).getTime();
    if (Number.isNaN(createdAt) || createdAt > new Date(filters.dateTo).getTime()) {
      return false;
    }
  }

  if (filters.query) {
    const target = filters.query.toLowerCase();
    const haystack = [
      record.title,
      record.description,
      record.linkedAsset.tag,
      record.linkedAsset.modelo,
      record.createdBy.matricula,
      record.rootCause,
    ]
      .map((value) => value?.toLowerCase?.() ?? "")
      .join(" ");

    if (!haystack.includes(target)) {
      return false;
    }
  }

  return true;
}
