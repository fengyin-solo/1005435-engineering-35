import type { EntryRow, ModuleMeta } from './types'

export class SeedValidationError extends Error {
  details: string[]
}

export function naturalKeyValue(meta: ModuleMeta, row: EntryRow): string
export function ledgerCode(moduleKey: string): string
export function validateCanonical(
  modules: ModuleMeta[],
  rows: Record<string, EntryRow[]>,
): void
export function validateImportBatch(
  meta: ModuleMeta,
  incoming: unknown,
): EntryRow[]
export function upsertByNaturalKey(
  meta: ModuleMeta,
  existing: EntryRow[],
  incoming: EntryRow[],
): { rows: EntryRow[]; added: number; updated: number }
export function applyLedger(
  projectMeta: ModuleMeta,
  existing: EntryRow[],
  sourceMeta: ModuleMeta,
  date: string,
): { rows: EntryRow[]; created: boolean }
export function buildSnapshot(
  modules: ModuleMeta[],
  canonical: Record<string, EntryRow[]>,
  options: { date: string },
): Record<string, EntryRow[]>
export function makeToken(rows: Record<string, EntryRow[]>, nonce: string): string

export const SNAPSHOT_PROJECT_KEY: 'project'
