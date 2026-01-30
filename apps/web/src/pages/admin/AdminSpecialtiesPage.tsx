import { useEffect, useMemo, useState } from 'react';
import {
  adminListSpecialties,
  adminCreateSpecialty,
  adminUpdateSpecialty,
  adminActivateSpecialty,
  adminDeactivateSpecialty,
  type AdminSpecialty,
  type AdminSpecialtiesPageInfo,
} from '../../api/admin-specialties';
import type { ApiError, ProblemDetails } from '../../api/http';
import { PaginationControls } from '../../components/PaginationControls';

type StatusFilter = 'all' | 'active' | 'inactive';

export function AdminSpecialtiesPage() {
  const [items, setItems] = useState<AdminSpecialty[]>([]);
  const [pageInfo, setPageInfo] = useState<AdminSpecialtiesPageInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState<number | ''>('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<ProblemDetails | null>(null);

  const statusLabel = (active: boolean) => (active ? 'Active' : 'Inactive');

  const paginationInfo = useMemo(() => {
    if (!pageInfo) return null;
    return {
      page: pageInfo.page,
      pageSize: pageInfo.pageSize,
      total: pageInfo.totalItems,
      totalPages: pageInfo.totalPages,
      hasNextPage: pageInfo.hasNextPage,
      hasPrevPage: pageInfo.hasPrevPage,
    };
  }, [pageInfo]);

  const loadSpecialties = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminListSpecialties({
        page,
        pageSize,
        q: query || undefined,
        isActive:
          statusFilter === 'all'
            ? undefined
            : statusFilter === 'active',
      });
      setItems(response.items);
      setPageInfo(response.pageInfo);
    } catch (err) {
      const apiError = err as ApiError;
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: apiError.message || 'Error al cargar specialties',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpecialties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, query, statusFilter]);

  const resetForm = () => {
    setFormMode('create');
    setEditingId(null);
    setName('');
    setSlug('');
    setSortOrder('');
    setIsActive(true);
    setFormError(null);
  };

  const handleEdit = (specialty: AdminSpecialty) => {
    setFormMode('edit');
    setEditingId(specialty.id);
    setName(specialty.name);
    setSlug(specialty.slug);
    setSortOrder(specialty.sortOrder);
    setIsActive(specialty.isActive);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        sortOrder: sortOrder === '' ? undefined : Number(sortOrder),
        isActive,
      };

      if (formMode === 'create') {
        await adminCreateSpecialty(payload);
      } else if (editingId) {
        await adminUpdateSpecialty(editingId, payload);
      }

      resetForm();
      await loadSpecialties();
    } catch (err) {
      const apiError = err as ApiError;
      const problem =
        apiError.problemDetails ||
        ({
          status: apiError.status || 500,
          detail: apiError.message || 'Error al guardar specialty',
        } as ProblemDetails);
      if (problem.status === 409) {
        setFormError({
          ...problem,
          detail: 'Nombre o slug ya existe.',
        });
      } else {
        setFormError(problem);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (specialty: AdminSpecialty) => {
    try {
      if (specialty.isActive) {
        await adminDeactivateSpecialty(specialty.id);
      } else {
        await adminActivateSpecialty(specialty.id);
      }
      await loadSpecialties();
    } catch (err) {
      const apiError = err as ApiError;
      setError(
        apiError.problemDetails || {
          status: apiError.status || 500,
          detail: apiError.message || 'Error al actualizar estado',
        },
      );
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Specialties</h2>

      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '12px' }}>
          {formMode === 'create' ? 'Nueva specialty' : 'Editar specialty'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 120px 120px',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <input
            type="number"
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(e.target.value === '' ? '' : Number(e.target.value))
            }
            placeholder="Order"
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <select
            value={isActive ? 'active' : 'inactive'}
            onChange={(e) => setIsActive(e.target.value === 'active')}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {formError && (
          <div style={{ color: '#b91c1c', marginTop: '12px' }}>
            {formError.detail}
          </div>
        )}

        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !slug.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#1f2a44',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {formMode === 'edit' && (
            <button
              onClick={resetForm}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#111827',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontWeight: 700 }}>Listado</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar"
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
            <button
              onClick={() => {
                setPage(1);
                setQuery(searchInput.trim());
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Buscar
            </button>
          </div>
        </div>

        {error && (
          <div style={{ color: '#b91c1c', marginBottom: '12px' }}>
            {error.detail}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#6b7280' }}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={{ color: '#6b7280' }}>Sin resultados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '8px 0' }}>Name</th>
                <th style={{ padding: '8px 0' }}>Slug</th>
                <th style={{ padding: '8px 0' }}>Order</th>
                <th style={{ padding: '8px 0' }}>Status</th>
                <th style={{ padding: '8px 0' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((specialty) => (
                <tr key={specialty.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '10px 0' }}>{specialty.name}</td>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>
                    {specialty.slug}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    {specialty.sortOrder}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: specialty.isActive
                          ? '#dcfce7'
                          : '#f3f4f6',
                        color: specialty.isActive ? '#166534' : '#6b7280',
                      }}
                    >
                      {statusLabel(specialty.isActive)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEdit(specialty)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActive(specialty)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: specialty.isActive
                            ? '#ef4444'
                            : '#16a34a',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        {specialty.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {paginationInfo && (
          <PaginationControls
            pageInfo={paginationInfo}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => prev + 1)}
          />
        )}
      </div>
    </div>
  );
}
