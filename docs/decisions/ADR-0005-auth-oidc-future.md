# ADR-0005 Auth OIDC future

## Contexto
- Estado actual: auth local con JWT access + refresh + sessions en DB.
- Se necesita soportar login social/SSO via OIDC (Google/Apple/Microsoft) en el futuro.

## Decision
- Mantener contrato interno `actor` (id UUID + role) como unica fuente para autorizacion.
- Desacoplar autenticacion (como se valida el token) de autorizacion (roles/ownership) en los modulos de dominio.

## Estrategia futura
- Introducir tabla `UserIdentity` para mapear (provider, providerSubject=sub) -> userId.
- `OidcAuthGuard` validara JWT del IdP con JWKS y resolvera actor via `UserIdentity`.
- Bloquear acceso si `user.status=disabled` aunque el token del IdP sea valido.

## Consecuencias
- Permite agregar OIDC sin cambiar endpoints de negocio.
- Evita acoplamiento de modulos a claims JWT especificos.
- Mejora escalabilidad: multiples providers con un solo contrato de autorizacion.
