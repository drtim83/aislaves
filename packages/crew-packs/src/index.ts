import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCrewPackYaml, type CrewPackManifest } from '@aislaves/shared';

const PACK_FILENAMES = [
  'sales-card-to-calendar.yaml',
  'fnb-pos-bookkeeping.yaml',
  'sop-claims-pulse.yaml',
] as const;

function loadAllCrewPacks(): CrewPackManifest[] {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const packsDir = join(srcDir, '..', 'packs');
  return PACK_FILENAMES.map((fileName) => {
    const raw = readFileSync(join(packsDir, fileName), 'utf8');
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
