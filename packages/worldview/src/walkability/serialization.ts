import type { ParsedWorld, Vec3Tuple } from '../core/index.js';
import { walkabilityWorldFingerprint } from './fingerprint.js';
import {
  WALKABILITY_FORMAT,
  WALKABILITY_VERSION,
  type WalkabilityAttempt,
  type WalkabilityMap,
  type WalkabilityTraversal,
} from './types.js';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  const result = finite(value, label);
  if (!Number.isInteger(result) || result < minimum) {
    throw new TypeError(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return result;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function tuple(value: unknown, label: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must contain three numbers`);
  }
  return [
    finite(value[0], `${label}[0]`),
    finite(value[1], `${label}[1]`),
    finite(value[2], `${label}[2]`),
  ];
}

function validateWalkability(value: unknown): WalkabilityMap {
  const root = record(value, 'walkability');
  if (root.format !== WALKABILITY_FORMAT || root.version !== WALKABILITY_VERSION) {
    throw new TypeError('Unsupported Worldview walkability format or version');
  }
  if (typeof root.worldFingerprint !== 'string' || !root.worldFingerprint) {
    throw new TypeError('walkability.worldFingerprint must be a non-empty string');
  }
  const parameters = record(root.parameters, 'walkability.parameters');
  const movement = record(parameters.movement, 'walkability.parameters.movement');
  const parsedParameters = {
    spacing: finite(parameters.spacing, 'walkability.parameters.spacing'),
    mergeDistance: finite(parameters.mergeDistance, 'walkability.parameters.mergeDistance'),
    directions: integer(parameters.directions, 'walkability.parameters.directions') as 4 | 8,
    maximumNodes: integer(parameters.maximumNodes, 'walkability.parameters.maximumNodes', 1),
    allowJump: boolean(parameters.allowJump, 'walkability.parameters.allowJump'),
    jumpSeconds: finite(parameters.jumpSeconds, 'walkability.parameters.jumpSeconds'),
    fixedDeltaSeconds: finite(
      parameters.fixedDeltaSeconds,
      'walkability.parameters.fixedDeltaSeconds',
    ),
    movement: {
      gravity: finite(movement.gravity, 'walkability.parameters.movement.gravity'),
      stopSpeed: finite(movement.stopSpeed, 'walkability.parameters.movement.stopSpeed'),
      maxSpeed: finite(movement.maxSpeed, 'walkability.parameters.movement.maxSpeed'),
      accelerate: finite(movement.accelerate, 'walkability.parameters.movement.accelerate'),
      airAccelerate: finite(
        movement.airAccelerate,
        'walkability.parameters.movement.airAccelerate',
      ),
      friction: finite(movement.friction, 'walkability.parameters.movement.friction'),
      edgeFriction: finite(movement.edgeFriction, 'walkability.parameters.movement.edgeFriction'),
      stepSize: finite(movement.stepSize, 'walkability.parameters.movement.stepSize'),
    },
  };
  if (parsedParameters.directions !== 4 && parsedParameters.directions !== 8) {
    throw new TypeError('walkability.parameters.directions must be 4 or 8');
  }

  if (!Array.isArray(root.seeds)) throw new TypeError('walkability.seeds must be an array');
  const seeds = root.seeds.map((item, index) => {
    const seed = record(item, `walkability.seeds[${index}]`);
    const entityIndex = seed.entityIndex;
    if (entityIndex !== null && (!Number.isInteger(entityIndex) || (entityIndex as number) < 0)) {
      throw new TypeError(`walkability.seeds[${index}].entityIndex must be null or non-negative`);
    }
    return {
      position: tuple(seed.position, `walkability.seeds[${index}].position`),
      entityIndex: entityIndex as number | null,
    };
  });

  if (!Array.isArray(root.nodes)) throw new TypeError('walkability.nodes must be an array');
  const nodes = root.nodes.map((item, index) => {
    const node = record(item, `walkability.nodes[${index}]`);
    const id = integer(node.id, `walkability.nodes[${index}].id`);
    if (id !== index) throw new TypeError(`walkability.nodes[${index}].id must equal its index`);
    const ceiling = node.ceilingOriginZ;
    return {
      id,
      position: tuple(node.position, `walkability.nodes[${index}].position`),
      floorNormal: tuple(node.floorNormal, `walkability.nodes[${index}].floorNormal`),
      ceilingOriginZ:
        ceiling === null ? null : finite(ceiling, `walkability.nodes[${index}].ceilingOriginZ`),
      seed: boolean(node.seed, `walkability.nodes[${index}].seed`),
      component: integer(node.component, `walkability.nodes[${index}].component`),
    };
  });

  if (!Array.isArray(root.edges)) throw new TypeError('walkability.edges must be an array');
  const edges = root.edges.map((item, index) => {
    const edge = record(item, `walkability.edges[${index}]`);
    const from = integer(edge.from, `walkability.edges[${index}].from`);
    const to = integer(edge.to, `walkability.edges[${index}].to`);
    if (!nodes[from] || !nodes[to])
      throw new TypeError(`walkability.edges[${index}] is out of range`);
    if (edge.traversal !== 'walk' && edge.traversal !== 'jump' && edge.traversal !== 'drop') {
      throw new TypeError(`walkability.edges[${index}].traversal is invalid`);
    }
    return { from, to, traversal: edge.traversal as WalkabilityTraversal };
  });

  if (!Array.isArray(root.boundaries)) {
    throw new TypeError('walkability.boundaries must be an array');
  }
  const boundaries = root.boundaries.map((item, index) => {
    const boundary = record(item, `walkability.boundaries[${index}]`);
    const from = integer(boundary.from, `walkability.boundaries[${index}].from`);
    if (!nodes[from]) throw new TypeError(`walkability.boundaries[${index}].from is out of range`);
    if (boundary.attempt !== 'walk' && boundary.attempt !== 'jump') {
      throw new TypeError(`walkability.boundaries[${index}].attempt is invalid`);
    }
    return {
      from,
      target: tuple(boundary.target, `walkability.boundaries[${index}].target`),
      end: tuple(boundary.end, `walkability.boundaries[${index}].end`),
      attempt: boundary.attempt as WalkabilityAttempt,
    };
  });

  const statistics = record(root.statistics, 'walkability.statistics');
  const parsedStatistics = {
    nodes: integer(statistics.nodes, 'walkability.statistics.nodes'),
    edges: integer(statistics.edges, 'walkability.statistics.edges'),
    walkEdges: integer(statistics.walkEdges, 'walkability.statistics.walkEdges'),
    jumpEdges: integer(statistics.jumpEdges, 'walkability.statistics.jumpEdges'),
    dropEdges: integer(statistics.dropEdges, 'walkability.statistics.dropEdges'),
    boundaries: integer(statistics.boundaries, 'walkability.statistics.boundaries'),
    components: integer(statistics.components, 'walkability.statistics.components'),
    truncated: boolean(statistics.truncated, 'walkability.statistics.truncated'),
  };
  const actualStatistics = {
    nodes: nodes.length,
    edges: edges.length,
    walkEdges: edges.filter((edge) => edge.traversal === 'walk').length,
    jumpEdges: edges.filter((edge) => edge.traversal === 'jump').length,
    dropEdges: edges.filter((edge) => edge.traversal === 'drop').length,
    boundaries: boundaries.length,
  };
  for (const key of Object.keys(actualStatistics) as (keyof typeof actualStatistics)[]) {
    if (parsedStatistics[key] !== actualStatistics[key]) {
      throw new TypeError(`walkability.statistics.${key} does not match its data`);
    }
  }
  const componentCount = nodes.reduce((highest, node) => Math.max(highest, node.component + 1), 0);
  if (componentCount !== parsedStatistics.components) {
    throw new TypeError('walkability.statistics.components does not match its nodes');
  }

  return {
    format: WALKABILITY_FORMAT,
    version: WALKABILITY_VERSION,
    worldFingerprint: root.worldFingerprint,
    parameters: parsedParameters,
    seeds,
    nodes,
    edges,
    boundaries,
    statistics: parsedStatistics,
  };
}

export function serializeWalkability(walkability: WalkabilityMap): string {
  return `${JSON.stringify(validateWalkability(walkability))}\n`;
}

export function parseWalkability(source: string | object): WalkabilityMap {
  const value: unknown = typeof source === 'string' ? JSON.parse(source) : source;
  return validateWalkability(value);
}

export function assertWalkabilityCompatible(world: ParsedWorld, walkability: WalkabilityMap): void {
  const expected = walkabilityWorldFingerprint(world);
  if (walkability.worldFingerprint !== expected) {
    throw new Error(
      `Walkability was generated for ${walkability.worldFingerprint}, but this map is ${expected}`,
    );
  }
}
