import { useLoaderData } from 'react-router';
import { EditorRoute } from './editor-route.js';
import type { HostedMapLoaderData } from './hosted-map-loader.js';

export function Component() {
  const { map } = useLoaderData<HostedMapLoaderData>();
  return <EditorRoute hostedMap={map} />;
}
