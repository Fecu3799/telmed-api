# Doctor Search - Checklist de Pruebas Manuales

## Pruebas Funcionales

### 1. Búsqueda sin filtros
- [ ] Navegar a `/doctor-search` desde el lobby
- [ ] Verificar que se cargan médicos por defecto (sin filtros)
- [ ] Verificar que se muestran cards con información básica

### 2. Buscar por nombre
- [ ] Ingresar texto en el campo "Nombre"
- [ ] Verificar que se aplica debounce (esperar ~300ms)
- [ ] Verificar que los resultados se filtran por nombre
- [ ] Probar con nombres parciales
- [ ] Probar con nombres que no existen (debe mostrar empty state)

### 3. Filtrar por especialidad
- [ ] Seleccionar una especialidad del dropdown
- [ ] Verificar que los resultados se filtran correctamente
- [ ] Cambiar a otra especialidad
- [ ] Seleccionar "Todas las especialidades" (debe resetear el filtro)

### 4. Paginación
- [ ] Si hay más de 5 resultados, verificar que aparece botón "Siguiente"
- [ ] Click en "Siguiente" debe cargar la siguiente página
- [ ] Click en "Anterior" debe volver a la página anterior
- [ ] Verificar que el número de página se actualiza correctamente
- [ ] Verificar que "Anterior" está deshabilitado en la primera página
- [ ] Verificar que "Siguiente" está deshabilitado cuando no hay más resultados

### 5. Ver perfil
- [ ] Click en "Ver Perfil" de cualquier médico
- [ ] Verificar que se abre un modal con información detallada
- [ ] Verificar que el modal muestra: nombre, precio, especialidades, ubicación (si aplica), distancia (si aplica)
- [ ] Click fuera del modal o botón "Cerrar" debe cerrar el modal

### 6. Manejo de estados

#### Empty state
- [ ] Realizar búsqueda que no devuelva resultados
- [ ] Verificar que se muestra mensaje: "No se encontraron médicos. Intenta cambiar los filtros de búsqueda."

#### Loading state
- [ ] Realizar búsqueda y verificar que aparece "Cargando..." durante la petición
- [ ] Verificar que desaparece cuando terminan los resultados

#### Error state
- [ ] Simular error de red (desconectar backend)
- [ ] Verificar que se muestra mensaje de error con código de status
- [ ] Verificar que los resultados anteriores se mantienen o se limpian según corresponda

### 7. Manejo de autenticación (401/403)
- [ ] Si la sesión expira (401), verificar que redirige a `/login`
- [ ] Si hay acceso denegado (403), verificar que redirige a `/login`
- [ ] Probar con token inválido

### 8. Navegación
- [ ] Click en "Buscar médicos" desde el lobby debe navegar a `/doctor-search`
- [ ] Click en "Volver al Lobby" debe navegar a `/lobby`
- [ ] Verificar que la ruta está protegida (requiere autenticación)

### 9. Reset de filtros
- [ ] Cambiar filtros (nombre, especialidad)
- [ ] Verificar que la paginación se resetea a la primera página
- [ ] Verificar que los resultados se actualizan correctamente

## Notas

- Page size fijo: 5 resultados por página
- Paginación: Usa cursor-based pagination (backend)
- Debounce: ~300ms para el campo de búsqueda por nombre
- Especialidades: Se cargan al montar la página (máximo 100)
- Filtros disponibles: nombre (q), especialidad (specialtyId)
- Filtros NO disponibles (backend no los soporta aún): cercanía (lat/lng/radiusKm), precio (maxPriceCents) - estos no se muestran en la UI
