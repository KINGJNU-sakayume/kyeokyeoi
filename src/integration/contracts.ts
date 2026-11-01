import type { Memory, RegionVisit, SourceReference } from '../db';
/** A contract only. There is no Life Hub endpoint, login or background sync. */
export interface ArchiveLink {
  from: { service: string; originalId: string; kind: 'memory' | 'visit' | 'activity' };
  to: { service: string; originalId: string; kind: 'memory' | 'visit' | 'activity' };
  relation: 'same-experience' | 'inspired-memory' | 'confirmed-place';
  confirmedByUser: boolean;
}
export interface ArchiveEnvelope {
  contractVersion: 1;
  source: SourceReference;
  /** Stable across retries. A new revision keeps the same originalId. */
  idempotencyKey: string;
  entity: { kind: 'memory'; record: Memory } | { kind: 'visit'; record: RegionVisit };
  links: ArchiveLink[];
  confirmedByUser: boolean;
}
/** Consumers must compare both the service/originalId key and the source revision. */
export function sourceKey(source: Pick<SourceReference, 'service' | 'originalId'>): string {
  return JSON.stringify([source.service, source.originalId]);
}
