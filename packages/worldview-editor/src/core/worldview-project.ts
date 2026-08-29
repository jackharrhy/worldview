import {
  isWorldviewGameProfile,
  worldviewGameProfile,
  type WorldviewGameProfile,
} from './game-profiles.js';

export type { WorldviewGameProfile } from './game-profiles.js';
export type EntityDefinitionFormat = 'fgd' | 'def' | 'ent';

export interface WorldviewEntityDefinitionSource {
  readonly path: string;
  readonly format: EntityDefinitionFormat;
}

export interface WorldviewProjectResources {
  /** Later entries override earlier WAD entries with the same logical texture name. */
  readonly wads: readonly string[];
  /** Ordered roots for loose profile-native materials such as Quake II WAL files. */
  readonly materialRoots?: readonly string[];
  readonly palette?: string;
  readonly spriteRoots: readonly string[];
  readonly entityDefinitions: readonly WorldviewEntityDefinitionSource[];
}

export interface WorldviewProjectBuildProfile {
  readonly id: string;
  readonly label: string;
  readonly quality: 'preview' | 'final';
}

export interface WorldviewProjectManifest {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly game: WorldviewGameProfile;
  readonly mapRoots: readonly string[];
  readonly resources: WorldviewProjectResources;
  readonly buildProfiles: readonly WorldviewProjectBuildProfile[];
  readonly defaultBuildProfile?: string;
}

export class WorldviewProjectParseError extends Error {
  public constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(field ? `${field}: ${message}` : message);
    this.name = 'WorldviewProjectParseError';
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorldviewProjectParseError('must be an object', field);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WorldviewProjectParseError('must be a non-empty string', field);
  }
  return value.trim();
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new WorldviewProjectParseError('must be an array', field);
  return value;
}

function relativePath(value: unknown, field: string, allowRoot = false): string {
  const path = string(value, field);
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) ||
    path.split('/').some((part) => part === '..' || part === '') ||
    (!allowRoot && path === '.')
  ) {
    throw new WorldviewProjectParseError('must be a contained project-relative POSIX path', field);
  }
  return path.replace(/^\.\//, '');
}

function unique(values: readonly string[], field: string): readonly string[] {
  if (new Set(values).size !== values.length) {
    throw new WorldviewProjectParseError('must not contain duplicates', field);
  }
  return values;
}

function parseResources(value: unknown): WorldviewProjectResources {
  const resources = record(value, 'resources');
  const wads = unique(
    array(resources.wads ?? [], 'resources.wads').map((path, index) =>
      relativePath(path, `resources.wads[${index}]`),
    ),
    'resources.wads',
  );
  const spriteRoots = unique(
    array(resources.spriteRoots ?? [], 'resources.spriteRoots').map((path, index) =>
      relativePath(path, `resources.spriteRoots[${index}]`, true),
    ),
    'resources.spriteRoots',
  );
  const materialRoots = unique(
    array(resources.materialRoots ?? [], 'resources.materialRoots').map((path, index) =>
      relativePath(path, `resources.materialRoots[${index}]`, true),
    ),
    'resources.materialRoots',
  );
  const entityDefinitions = array(
    resources.entityDefinitions ?? [],
    'resources.entityDefinitions',
  ).map((definitionValue, index) => {
    const definition = record(definitionValue, `resources.entityDefinitions[${index}]`);
    const format = string(definition.format, `resources.entityDefinitions[${index}].format`);
    if (format !== 'fgd' && format !== 'def' && format !== 'ent') {
      throw new WorldviewProjectParseError(
        'must be fgd, def, or ent',
        `resources.entityDefinitions[${index}].format`,
      );
    }
    return {
      path: relativePath(definition.path, `resources.entityDefinitions[${index}].path`),
      format,
    } satisfies WorldviewEntityDefinitionSource;
  });
  return {
    wads,
    ...(materialRoots.length === 0 ? {} : { materialRoots }),
    ...(resources.palette === undefined
      ? {}
      : { palette: relativePath(resources.palette, 'resources.palette') }),
    spriteRoots,
    entityDefinitions,
  };
}

function parseBuildProfiles(value: unknown): readonly WorldviewProjectBuildProfile[] {
  const profiles = array(value ?? [], 'buildProfiles').map((profileValue, index) => {
    const profile = record(profileValue, `buildProfiles[${index}]`);
    const quality = string(profile.quality, `buildProfiles[${index}].quality`);
    if (quality !== 'preview' && quality !== 'final') {
      throw new WorldviewProjectParseError(
        'must be preview or final',
        `buildProfiles[${index}].quality`,
      );
    }
    return {
      id: string(profile.id, `buildProfiles[${index}].id`),
      label: string(profile.label, `buildProfiles[${index}].label`),
      quality,
    } satisfies WorldviewProjectBuildProfile;
  });
  unique(
    profiles.map(({ id }) => id),
    'buildProfiles[].id',
  );
  return profiles;
}

export function parseWorldviewProject(source: string): WorldviewProjectManifest {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new WorldviewProjectParseError(
      `contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const project = record(value, 'project');
  if (project.schemaVersion !== 1) {
    throw new WorldviewProjectParseError('only schemaVersion 1 is supported', 'schemaVersion');
  }
  const game = string(project.game, 'game');
  if (!isWorldviewGameProfile(game)) {
    throw new WorldviewProjectParseError('must be quake, goldsrc, or quake2', 'game');
  }
  const resources = parseResources(project.resources);
  const supportedDefinitionFormats = worldviewGameProfile(game).entityDefinitionFormats;
  for (const [index, definition] of resources.entityDefinitions.entries()) {
    if (!supportedDefinitionFormats.includes(definition.format)) {
      throw new WorldviewProjectParseError(
        `${definition.format} is not supported by the ${game} profile`,
        `resources.entityDefinitions[${index}].format`,
      );
    }
  }
  const mapRoots = unique(
    array(project.mapRoots, 'mapRoots').map((path, index) =>
      relativePath(path, `mapRoots[${index}]`, true),
    ),
    'mapRoots',
  );
  if (mapRoots.length === 0) {
    throw new WorldviewProjectParseError('must contain at least one map root', 'mapRoots');
  }
  const buildProfiles = parseBuildProfiles(project.buildProfiles);
  const defaultBuildProfile =
    project.defaultBuildProfile === undefined
      ? undefined
      : string(project.defaultBuildProfile, 'defaultBuildProfile');
  if (
    defaultBuildProfile !== undefined &&
    !buildProfiles.some(({ id }) => id === defaultBuildProfile)
  ) {
    throw new WorldviewProjectParseError(
      'must reference an existing build profile',
      'defaultBuildProfile',
    );
  }
  return {
    schemaVersion: 1,
    name: string(project.name, 'name'),
    game,
    mapRoots,
    resources,
    buildProfiles,
    ...(defaultBuildProfile === undefined ? {} : { defaultBuildProfile }),
  };
}

export function serializeWorldviewProject(project: WorldviewProjectManifest): string {
  const validated = parseWorldviewProject(JSON.stringify(project));
  return `${JSON.stringify(validated, null, 2)}\n`;
}
