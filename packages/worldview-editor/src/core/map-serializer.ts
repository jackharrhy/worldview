import type { MapBrush, MapDocument, MapEntity, MapFace, Vec3 } from './types.js';

function scalar(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Cannot serialize a non-finite number');
  const corrected = Math.abs(value) < 1e-9 ? 0 : value;
  return Number.isInteger(corrected)
    ? String(corrected)
    : corrected.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function point(value: Vec3): string {
  return `( ${scalar(value[0])} ${scalar(value[1])} ${scalar(value[2])} )`;
}

function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;
}

function surfaceSuffix(face: MapFace): string {
  if (
    face.surface.contents === undefined &&
    face.surface.flags === undefined &&
    face.surface.value === undefined
  )
    return '';
  return ` ${scalar(face.surface.contents ?? 0)} ${scalar(face.surface.flags ?? 0)} ${scalar(face.surface.value ?? 0)}`;
}

export function serializeMapFace(face: MapFace, valve220: boolean): string {
  const prefix = `${point(face.planePoints[0])} ${point(face.planePoints[1])} ${point(face.planePoints[2])} ${face.material}`;
  if (!valve220) {
    return `${prefix} ${scalar(face.projection.offset[0])} ${scalar(face.projection.offset[1])} ${scalar(face.projection.rotationDegrees)} ${scalar(face.projection.scale[0])} ${scalar(face.projection.scale[1])}${surfaceSuffix(face)}`;
  }
  const u = face.projection.uAxis;
  const v = face.projection.vAxis;
  return `${prefix} [ ${scalar(u[0])} ${scalar(u[1])} ${scalar(u[2])} ${scalar(face.projection.offset[0])} ] [ ${scalar(v[0])} ${scalar(v[1])} ${scalar(v[2])} ${scalar(face.projection.offset[1])} ] ${scalar(face.projection.rotationDegrees)} ${scalar(face.projection.scale[0])} ${scalar(face.projection.scale[1])}${surfaceSuffix(face)}`;
}

export function serializeMapBrush(brush: MapBrush, valve220: boolean): string {
  return ['{', ...brush.faces.map((face) => serializeMapFace(face, valve220)), '}'].join('\n');
}

export function serializeMapEntity(entity: MapEntity, valve220: boolean): string {
  return [
    '{',
    ...Object.entries(entity.properties).map(([key, value]) => `${quote(key)} ${quote(value)}`),
    ...entity.brushes.map((brush) => serializeMapBrush(brush, valve220)),
    '}',
  ].join('\n');
}

export function serializeMap(document: MapDocument): string {
  const output: string[] = [];
  const valve220 = document.format === 'valve-220';
  for (const entity of document.entities) {
    output.push('{');
    for (const [key, value] of Object.entries(entity.properties)) {
      output.push(`${quote(key)} ${quote(value)}`);
    }
    for (const brush of entity.brushes) {
      output.push('{');
      for (const face of brush.faces) output.push(serializeMapFace(face, valve220));
      output.push('}');
    }
    output.push('}');
  }
  return `${output.join('\n')}\n`;
}
