const hostedIdPattern = /^[a-z0-9]{12}$/;

interface HostedRouteResource {
  readonly id: string;
  readonly slug: string;
}

export function hostedIdFromRouteReference(reference: string | undefined): string | null {
  if (!reference) return null;
  const separator = reference.indexOf('-');
  const id = separator === -1 ? reference : reference.slice(0, separator);
  if (!hostedIdPattern.test(id)) return null;
  return id;
}

function routeReference(resource: HostedRouteResource): string {
  return encodeURIComponent(`${resource.id}-${resource.slug}`);
}

export function hostedProjectPath(project: HostedRouteResource): string {
  return `/project/${routeReference(project)}`;
}

export function hostedMapPath(project: HostedRouteResource, map: HostedRouteResource): string {
  return `${hostedProjectPath(project)}/map/${routeReference(map)}`;
}
