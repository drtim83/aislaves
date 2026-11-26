import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCrewPackYaml, type CrewPackManifest } from '@aislaves/shared';
import { EMBEDDED_PACKS_YAML } from './packs-embedded';

const PACK_FILENAMES = [
  'sales-card-to-calendar.yaml',
  'fnb-pos-bookkeeping.yaml',
  'sop-claims-pulse.yaml',
] as const;

function loadAllCrewPacks(): CrewPackManifest[] {
  let packsDir = '';
  try {
    const srcDir = dirname(fileURLToPath(import.meta.url));
    packsDir = join(/*turbopackIgnore: true*/ srcDir, '..', 'packs');
  } catch {
    packsDir = '';
  }

  return PACK_FILENAMES.map((fileName) => {
    const fullPath = packsDir ? join(/*turbopackIgnore: true*/ packsDir, fileName) : '';
    const raw =
      fullPath && existsSync(/*turbopackIgnore: true*/ fullPath)
        ? readFileSync(/*turbopackIgnore: true*/ fullPath, 'utf8')
        : EMBEDDED_PACKS_YAML[fileName];
    return parseCrewPackYaml(raw);
  });
}

export const CREW_PACKS: CrewPackManifest[] = loadAllCrewPacks();

export function getCrewPackById(packId: string): CrewPackManifest | undefined {
  return CREW_PACKS.find((pack) => pack.id === packId);
}

export const DIGITAL_EMPLOYEE_ROSTER = CREW_PACKS.flatMap((pack) =>
  pack.agents.map((agent) => ({
    ...agent,
    packId: pack.id,
    packName: pack.name,
    bundleLabel: pack.bundleLabel,
  }))
);
