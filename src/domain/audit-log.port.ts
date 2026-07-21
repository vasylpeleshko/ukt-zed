import { ClassifyResult } from './classification.types';

export interface AuditLogPort {
  log(query: string, result: ClassifyResult, latencyMs: number): Promise<void>;
}

export const AUDIT_LOG_PORT = Symbol('AUDIT_LOG_PORT');
