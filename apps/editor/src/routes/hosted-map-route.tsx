import { useLoaderData } from 'react-router';
import { EditorRoute } from './editor-route.js';
import type { loader } from './hosted-map-loader.js';
import type { HostedMapLaunch } from './hosted-project-api.js';

export function Component() {
  const { map } = useLoaderData<typeof loader>();
  return <EditorRoute hostedMap={map as unknown as HostedMapLaunch} />;
}
