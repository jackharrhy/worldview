import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

export function Component() {
  const { projectId, mapId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (!token || !projectId || !mapId) {
      setError('This share link is incomplete.');
      return;
    }
    history.replaceState(null, '', location.pathname);
    void fetch('/api/guest-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, displayName: 'Guest mapper' }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'This share link is unavailable.',
          );
        }
        await navigate(
          `/projects/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(mapId)}`,
          { replace: true },
        );
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [mapId, navigate, projectId]);
  return <main className="route-loading">{error ?? 'Joining shared map…'}</main>;
}
