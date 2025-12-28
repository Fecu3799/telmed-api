# Auth contract (current + future)

## Estado actual (JWT local)
- Auth con Bearer JWT (access) y refresh token.
- Sessions en DB para refresh y rotacion.
- Logout revoca session.
- Los endpoints de negocio usan el `actor` (id + role) provisto por el guard.

## Futuro OIDC (Google/Apple/Microsoft)
- El login social/SSO se validara via IdP (JWT + JWKS).
- Se mapeara identidad externa a `userId` interno.
- Los endpoints de negocio no cambian su contrato.

## Contrato estable `actor`
- El backend garantiza que `actor` siempre expone `id` (UUID) y `role`.
- El frontend no debe depender de claims JWT especificos.
- Con OIDC, el `actor` seguira siendo la unica fuente para autorizacion.
