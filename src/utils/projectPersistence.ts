import type { FrameParams } from './geometry';
import type { Lang } from './translations';
import { normalizeFrameParams, validateFrameParams } from './params.ts';
import { PRINTER_PROFILES } from './printerProfiles.ts';
import { MAX_STRIPS, STRIP_LIMITS } from './mounting.ts';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_STORAGE_KEY = 'hueforge-frame-generator.project.v1';
export const PROJECT_RECOVERY_KEY = 'hueforge-frame-generator.project.recovery.json';
export const MAX_PROJECT_FILE_BYTES = 1_000_000;

export interface ProjectStrip {
  id: string;
  x: number;
  y: number;
  w: number;
  l: number;
  size: 'S' | 'M' | 'L' | 'custom';
  angle: number;
}

export interface PrinterSettings {
  profileId: string;
  name: string;
  bedX: number;
  bedY: number;
}

export interface FrameProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  params: FrameParams;
  strips: ProjectStrip[];
  materialColor: string;
  lang: Lang;
  showGrid: boolean;
  activeTab: '3d' | '2d';
  printer: PrinterSettings;
}

export class ProjectImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectImportError';
  }
}

export interface StoredProjectResult {
  project: FrameProject;
  recoveryEncountered: boolean;
  recoverySaved: boolean;
  recoveryRaw: string | null;
  recoveryBackup: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function parseStrips(value: unknown): ProjectStrip[] {
  if (!Array.isArray(value) || value.length > MAX_STRIPS) {
    throw new ProjectImportError(`Project must contain at most ${MAX_STRIPS} strips.`);
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new ProjectImportError(`Strip ${index + 1} is invalid.`);
    const { id, x, y, w, l, size, angle } = item;
    if (typeof id !== 'string' || id.length < 1 || id.length > 100 || ids.has(id) ||
        !finiteNumber(x, STRIP_LIMITS.x.min, STRIP_LIMITS.x.max) || !finiteNumber(y, STRIP_LIMITS.y.min, STRIP_LIMITS.y.max) ||
        !finiteNumber(w, STRIP_LIMITS.w.min, STRIP_LIMITS.w.max) || !finiteNumber(l, STRIP_LIMITS.l.min, STRIP_LIMITS.l.max) ||
        !finiteNumber(angle, STRIP_LIMITS.angle.min, STRIP_LIMITS.angle.max) ||
        !['S', 'M', 'L', 'custom'].includes(String(size))) {
      throw new ProjectImportError(`Strip ${index + 1} contains invalid values.`);
    }
    ids.add(id);
    return { id, x, y, w, l, size: size as ProjectStrip['size'], angle };
  });
}

function parsePrinter(value: unknown): PrinterSettings {
  if (!isRecord(value)) throw new ProjectImportError('Printer settings are missing.');
  const { profileId, name, bedX, bedY } = value;
  if (typeof profileId !== 'string' || profileId.length > 80 ||
      typeof name !== 'string' || name.length > 80 ||
      !finiteNumber(bedX, 50, 2000) || !finiteNumber(bedY, 50, 2000)) {
    throw new ProjectImportError('Printer bed dimensions must be between 50 and 2000 mm.');
  }
  const profile = PRINTER_PROFILES.find((item) => item.id === profileId);
  if (!profile || (profileId !== 'custom' && (bedX !== profile.bed.x || bedY !== profile.bed.y))) {
    throw new ProjectImportError('Printer profile and bed dimensions do not match.');
  }
  return { profileId, name, bedX, bedY };
}

/** Validates and normalizes project JSON before it can reach the geometry generator. */
export function parseProject(input: unknown): FrameProject {
  if (!isRecord(input) || input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectImportError('Unsupported or missing project schema version.');
  }
  const rawParams = input.params;
  if (!isRecord(rawParams)) throw new ProjectImportError('Frame parameters are missing or invalid.');
  const rawErrors = validateFrameParams(rawParams as unknown as FrameParams);
  if (rawErrors.length) throw new ProjectImportError(rawErrors.join(' '));
  const params = normalizeFrameParams(rawParams);
  const normalizedErrors = validateFrameParams(params);
  if (normalizedErrors.length) throw new ProjectImportError(normalizedErrors.join(' '));
  const sourceKeys = Object.keys(rawParams);
  if (sourceKeys.length !== Object.keys(params).length || Object.keys(params).some((key) => params[key as keyof FrameParams] !== rawParams[key])) {
    throw new ProjectImportError('Frame parameters need normalization; please open and resave this project in a compatible version.');
  }

  if (typeof input.materialColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.materialColor)) {
    throw new ProjectImportError('Material color must be a six-digit HEX value.');
  }
  if (input.lang !== 'en' && input.lang !== 'pl') throw new ProjectImportError('Project language is invalid.');
  if (typeof input.showGrid !== 'boolean') throw new ProjectImportError('Grid setting is invalid.');
  if (input.activeTab !== '3d' && input.activeTab !== '2d') throw new ProjectImportError('Active tab is invalid.');

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    params,
    strips: parseStrips(input.strips),
    materialColor: input.materialColor.toLowerCase(),
    lang: input.lang,
    showGrid: input.showGrid,
    activeTab: input.activeTab,
    printer: parsePrinter(input.printer)
  };
}

export function parseProjectText(text: string): FrameProject {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new ProjectImportError(`Project file exceeds ${MAX_PROJECT_FILE_BYTES} bytes.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProjectImportError('Project file is not valid JSON.');
  }
  return parseProject(value);
}

export function loadProjectFromStorageResult(storage: Pick<Storage, 'getItem' | 'setItem'>, fallback: FrameProject): StoredProjectResult {
  try {
    const stored = storage.getItem(PROJECT_STORAGE_KEY);
    if (!stored) return { project: fallback, recoveryEncountered: false, recoverySaved: false, recoveryRaw: null, recoveryBackup: null };
    try {
      return { project: parseProjectText(stored), recoveryEncountered: false, recoverySaved: false, recoveryRaw: null, recoveryBackup: null };
    } catch {
      let recoverySaved = false;
      let recoveryBackup: string | null = null;
      try {
        recoveryBackup = storage.getItem(PROJECT_RECOVERY_KEY);
        if (recoveryBackup === stored) {
          recoverySaved = true;
        } else if (recoveryBackup === null) {
          storage.setItem(PROJECT_RECOVERY_KEY, stored);
          recoveryBackup = stored;
          recoverySaved = true;
        }
      } catch {
        // Keep the original value in the primary slot until an explicit edit can be saved.
      }
      return { project: fallback, recoveryEncountered: true, recoverySaved, recoveryRaw: stored, recoveryBackup };
    }
  } catch {
    return { project: fallback, recoveryEncountered: false, recoverySaved: false, recoveryRaw: null, recoveryBackup: null };
  }
}

export function loadProjectFromStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, fallback: FrameProject): FrameProject {
  return loadProjectFromStorageResult(storage, fallback).project;
}

export function saveProjectToStorage(storage: Pick<Storage, 'setItem'>, project: FrameProject): boolean {
  try {
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

