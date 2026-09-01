import {
  WorldviewError,
  createWorldview,
  planOverview,
  type OverviewCaptureOptions,
  type WorldSource,
  type WorldviewViewer,
} from '@jackharrhy/worldview';
import {
  parseEntities,
  planOverview as planCoreOverview,
  spriteReference,
  type ParsedWorld,
} from '@jackharrhy/worldview/core';
import { WorldViewElement, defineWorldViewElement } from '@jackharrhy/worldview/element';
import { SnapshotStore } from '@jackharrhy/worldview/runtime';
import {
  parseWalkability,
  planWalkabilityCutaway,
  serializeWalkability,
  type WalkabilityMap,
} from '@jackharrhy/worldview/walkability';

const consumerTag = 'world-view-consumer-smoke';
defineWorldViewElement(consumerTag);
const parsed = parseEntities('{ "classname" "worldspawn" "message" "consumer" }');
const sprite = spriteReference('sprites/consumer.spr');

// These assignments keep the public type surface in the consumer compilation without constructing
// GPU resources. The browser smoke assertion below covers the runtime exports.
const source: WorldSource = { bsp: new ArrayBuffer(0) };
const viewerFactory: (options: Parameters<typeof createWorldview>[0]) => Promise<WorldviewViewer> =
  createWorldview;
const parsedWorld: ParsedWorld | null = null;
const overviewOptions: OverviewCaptureOptions = {
  width: 1024,
  height: 768,
  rotation: 'auto',
  lighting: 'lightmapped',
  cutaway: 'auto',
};
void source;
void viewerFactory;
void parsedWorld;
void overviewOptions;
const walkability: WalkabilityMap | null = null;
const loadWalkability: WorldviewViewer['loadWalkability'] | null = null;
void walkability;
void loadWalkability;

document.body.dataset.main = String(typeof createWorldview === 'function');
document.body.dataset.overview = String(typeof planOverview === 'function');
document.body.dataset.core = String(
  parsed[0]?.classname === 'worldspawn' &&
    sprite?.normalizedPath === 'sprites/consumer.spr' &&
    typeof planCoreOverview === 'function',
);
document.body.dataset.element = String(
  customElements.get(consumerTag) === WorldViewElement &&
    customElements.get('world-view') === undefined,
);
document.body.dataset.walkability = String(
  typeof parseWalkability === 'function' &&
    typeof planWalkabilityCutaway === 'function' &&
    typeof serializeWalkability === 'function',
);
document.body.dataset.error = String(new WorldviewError('invalid-data', 'consumer').code);
document.body.dataset.runtime = String(new SnapshotStore('ready').getSnapshot() === 'ready');
