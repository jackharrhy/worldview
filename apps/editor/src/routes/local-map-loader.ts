import { IndexedDbCollaborationOutbox } from '../collaboration-outbox.js';
import { IndexedDbDocumentRecoveryStorage } from '../document-recovery.js';

const detachedMaps = new IndexedDbCollaborationOutbox();
const recovery = new IndexedDbDocumentRecoveryStorage();

export async function loader({ params }: { readonly params: Record<string, string | undefined> }) {
  const id = params.copyId;
  if (!id) throw new Response('Detached map ID required', { status: 400 });
  const map = await detachedMaps.loadDetached(id);
  if (!map) throw new Response('Detached map not found', { status: 404 });
  const latest = await recovery.load(map.documentKey);
  return {
    map: latest
      ? {
          ...map,
          fileName: latest.fileName,
          document: latest.document,
          source: latest.source,
        }
      : map,
  };
}
