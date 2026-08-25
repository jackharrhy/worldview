import type { Vec3 } from './types.js';

export const GEOMETRY_EPSILON = 0.001;

export function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

export function scale(value: Vec3, factor: number): Vec3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

export function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function cross(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

export function normalize(value: Vec3): Vec3 | null {
  const magnitude = length(value);
  return magnitude <= Number.EPSILON ? null : scale(value, 1 / magnitude);
}

export function distanceSquared(left: Vec3, right: Vec3): number {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

export interface Plane {
  readonly normal: Vec3;
  readonly distance: number;
}

/** Produces the outward plane orientation used by Quake-family text map formats. */
export function planeFromPoints(points: readonly [Vec3, Vec3, Vec3]): Plane | null {
  const normal = normalize(cross(subtract(points[2], points[0]), subtract(points[1], points[0])));
  return normal ? { normal, distance: dot(normal, points[0]) } : null;
}

export function intersectPlanes(first: Plane, second: Plane, third: Plane): Vec3 | null {
  const secondThird = cross(second.normal, third.normal);
  const denominator = dot(first.normal, secondThird);
  if (Math.abs(denominator) <= 1e-8) return null;
  const thirdFirst = cross(third.normal, first.normal);
  const firstSecond = cross(first.normal, second.normal);
  const point = scale(
    add(
      add(scale(secondThird, first.distance), scale(thirdFirst, second.distance)),
      scale(firstSecond, third.distance),
    ),
    1 / denominator,
  );
  return [
    Math.abs(point[0]) <= 1e-10 ? 0 : point[0],
    Math.abs(point[1]) <= 1e-10 ? 0 : point[1],
    Math.abs(point[2]) <= 1e-10 ? 0 : point[2],
  ];
}

export function rotateAroundAxis(value: Vec3, axis: Vec3, radians: number): Vec3 {
  const unit = normalize(axis);
  if (!unit) return value;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return add(
    add(scale(value, cosine), scale(cross(unit, value), sine)),
    scale(unit, dot(unit, value) * (1 - cosine)),
  );
}
