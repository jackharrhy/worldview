import { useLoaderData } from 'react-router';

import { EditorRoute } from './editor-route.js';
import type { loader } from './local-map-loader.js';

export function Component() {
  const { map } = useLoaderData<typeof loader>();
  return <EditorRoute detachedMap={map} />;
}
