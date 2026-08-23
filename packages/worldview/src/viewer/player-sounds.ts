import { soundReference, type SoundReference } from '../core/index.js';

export type PlayerSurfaceMaterial =
  | 'concrete'
  | 'dirt'
  | 'grate'
  | 'metal'
  | 'slosh'
  | 'tile'
  | 'wood';

export function playerSurfaceMaterial(textureName: string): PlayerSurfaceMaterial {
  const name = textureName
    .toLowerCase()
    .replace(/^[-+][0-9a-j]/, '')
    .replace(/^[{!~]/, '');
  if (/(water|slime|slosh|liquid|sew)/.test(name)) return 'slosh';
  if (/(grate|grid|vent|duct)/.test(name)) return 'grate';
  if (/(metal|steel|pipe|girder|iron|chrome|mtl)/.test(name)) return 'metal';
  if (/(wood|crate|board|plank|box|card)/.test(name)) return 'wood';
  if (/(dirt|sand|grass|mud|ground|forest|flower)/.test(name)) return 'dirt';
  if (/(tile|marble|glass|ceramic)/.test(name)) return 'tile';
  return 'concrete';
}

const concrete = [1, 2, 3, 4].map((index) => `player/pl_step${index}.wav`);
const families: Readonly<Record<PlayerSurfaceMaterial, readonly string[]>> = {
  concrete,
  dirt: [1, 2, 3, 4].map((index) => `player/pl_dirt${index}.wav`),
  grate: [1, 2, 3, 4].map((index) => `player/pl_grate${index}.wav`),
  metal: [1, 2, 3, 4].map((index) => `player/pl_metal${index}.wav`),
  slosh: [1, 2, 3, 4].map((index) => `player/pl_slosh${index}.wav`),
  tile: [1, 2, 3, 4, 5].map((index) => `player/pl_tile${index}.wav`),
  // The available player sample families have no dedicated wood set, so wood uses concrete.
  wood: concrete,
};

export const GOLDSRC_PLAYER_SOUND_REFERENCES: readonly SoundReference[] = [
  ...new Set(Object.values(families).flat()),
].map((path) => soundReference(path)!);

/** Selects alternating left/right variants with the occasional fifth tile sample. */
export function goldSrcPlayerSoundPath(material: PlayerSurfaceMaterial, sequence: number): string {
  const family = families[material];
  if (material === 'tile' && sequence % 10 === 9) return family[4]!;
  const foot = sequence % 2;
  const variation = Math.floor(sequence / 2) % 2;
  return family[foot + variation * 2]!;
}
