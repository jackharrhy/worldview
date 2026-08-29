# 4orm OAuth integration

Hosted Worldview projects use 4orm for identity and Worldview for application sessions and
authorization. The integration deliberately follows Artbin's small server-side flow instead of
turning 4orm access tokens into the browser's application session.

## Flow

1. `GET /auth/login` creates an S256 PKCE verifier/challenge, a random state value, and a bounded
   same-origin return path. The verifier and state live in a short-lived, HTTP-only transaction
   cookie.
2. 4orm authenticates and obtains consent for the registered `worldview` public client.
3. `GET /auth/callback` verifies state, exchanges the one-use code, and calls 4orm userinfo.
4. Worldview upserts the stable 4orm `sub`, current username/display name, and administrator flag,
   creates an opaque server-side session, discards the OAuth credentials, and redirects to the
   validated return path.
5. The browser subsequently authenticates only with the Worldview session cookie. Logout deletes
   that session and clears the cookie.

The production cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/`. Mutating API
requests additionally require a same-origin `Origin` or Fetch Metadata signal. OAuth state is
single-use and callback errors never disclose tokens or verifiers.

## 4orm boundary

4orm needs only a declarative `worldview` client registration with production and localhost
callback URLs, `authorization_code`, `openid profile`, and its existing required S256 PKCE flow.
There is no new scope, token format, refresh-token vault, OIDC signing work, or Worldview-specific
endpoint in 4orm. Registration tests and a Worldview callback integration test pin the boundary.

## Identity versus authorization

The 4orm subject is the durable external identity. Worldview project roles, personal folders, and
sessions are Worldview data. A refreshed userinfo response updates presentation
fields but never changes project ownership. The 4orm administrator bit grants an audited support
override; normal authorization continues to use project membership.
