import { Outlet, isRouteErrorResponse, useLocation, useRouteError } from 'react-router';

export interface RouteErrorPresentation {
  readonly status: number;
  readonly title: string;
  readonly description: string;
  readonly recovery: 'home' | 'login' | 'retry';
}

const ERROR_PRESENTATIONS: Readonly<Record<number, RouteErrorPresentation>> = {
  401: {
    status: 401,
    title: 'Sign in to continue',
    description: 'Hosted projects require a 4orm account.',
    recovery: 'login',
  },
  403: {
    status: 403,
    title: 'This project is private',
    description: 'Ask the project owner to add your account, then try again.',
    recovery: 'home',
  },
  404: {
    status: 404,
    title: 'This page does not exist',
    description: 'The link may be incomplete, or the project may have moved.',
    recovery: 'home',
  },
};

const UNEXPECTED_ERROR: RouteErrorPresentation = {
  status: 500,
  title: 'Worldview could not load this page',
  description: 'Try loading it again. If the problem continues, return to your projects.',
  recovery: 'retry',
};

export function routeErrorPresentation(error: unknown): RouteErrorPresentation {
  if (!isRouteErrorResponse(error)) return UNEXPECTED_ERROR;
  return ERROR_PRESENTATIONS[error.status] ?? { ...UNEXPECTED_ERROR, status: error.status };
}

export function Component() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const presentation = routeErrorPresentation(error);
  const returnTo = `${location.pathname}${location.search}`;
  const primaryHref =
    presentation.recovery === 'login'
      ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
      : presentation.recovery === 'retry'
        ? returnTo
        : '/';
  const primaryLabel =
    presentation.recovery === 'login'
      ? 'Sign in with 4orm'
      : presentation.recovery === 'retry'
        ? 'Try again'
        : 'Back to projects';

  return (
    <main className="route-error-page" data-error-status={presentation.status}>
      <section className="route-error-panel" aria-labelledby="route-error-title">
        <header>
          <a className="route-error-wordmark" href="/">
            Worldview Editor
          </a>
          <strong className="route-error-code">Error {presentation.status}</strong>
        </header>
        <div className="route-error-message">
          <h1 id="route-error-title">{presentation.title}</h1>
          <p>{presentation.description}</p>
        </div>
        <nav className="route-error-actions" aria-label="Error recovery">
          <a className="wv-button wv-button-primary wv-button-regular" href={primaryHref}>
            {primaryLabel}
          </a>
          {presentation.recovery !== 'home' && (
            <a className="wv-button wv-button-secondary wv-button-regular" href="/">
              Back to projects
            </a>
          )}
        </nav>
      </section>
    </main>
  );
}
