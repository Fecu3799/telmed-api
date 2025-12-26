# ADR-0002 Pagination contract

## Contexto
Se requiere un contrato consistente para paginacion en endpoints de listados.

## Decision
- Formato de respuesta:
  - `{ items, pageInfo }`
- `pageInfo`:
  - `page` (1-based)
  - `limit`
  - `total`
  - `hasNextPage`
  - `hasPrevPage` (opcional)

## Consecuencias
- El frontend debe calcular `skip = (page - 1) * limit` y usar `page` como 1-based.
- Se puede renderizar paginacion sin llamadas extra porque incluye `total`.
