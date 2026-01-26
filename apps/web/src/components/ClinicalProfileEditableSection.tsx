import { useCallback, useEffect, useState } from 'react';
import type {
  ClinicalProfileCreatePayload,
  ClinicalProfileItem,
  ClinicalProfilePageInfo,
  ClinicalProfileResponse,
  ClinicalProfileUpdatePayload,
} from '../api/clinical-profile';
import type { ProblemDetails } from '../api/http';
import { ClinicalProfileListSection } from './ClinicalProfileListSection';

type ClinicalProfileEditableSectionProps = {
  title: string;
  emptyText: string;
  pageSize?: number;
  list: (page: number, pageSize: number) => Promise<ClinicalProfileResponse>;
  createItem: (
    payload: ClinicalProfileCreatePayload,
  ) => Promise<ClinicalProfileItem>;
  updateItem: (
    id: string,
    payload: ClinicalProfileUpdatePayload,
  ) => Promise<ClinicalProfileItem>;
  deleteItem: (id: string) => Promise<void>;
};

function resolveErrorMessage(err: unknown) {
  const apiError = err as { problemDetails?: ProblemDetails };
  const status = apiError.problemDetails?.status;
  if (status === 401 || status === 403) {
    return 'No autorizado';
  }
  if (status === 404) {
    return 'No disponible.';
  }
  if (status === 409) {
    return 'Conflicto al guardar.';
  }
  if (status === 422) {
    return 'Datos inválidos.';
  }
  if (status === 429) {
    return 'Rate limited, reintentá en unos segundos';
  }
  return 'Error al cargar';
}

export function ClinicalProfileEditableSection({
  title,
  emptyText,
  pageSize = 20,
  list,
  createItem,
  updateItem,
  deleteItem,
}: ClinicalProfileEditableSectionProps) {
  const [items, setItems] = useState<ClinicalProfileItem[]>([]);
  const [pageInfo, setPageInfo] = useState<ClinicalProfilePageInfo | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createActive, setCreateActive] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await list(page, pageSize);
      setItems(response.items);
      setPageInfo(response.pageInfo);
    } catch (err) {
      setItems([]);
      setPageInfo(null);
      setError(resolveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [list, page, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateNotes('');
    setCreateActive(true);
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError('El nombre es requerido.');
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      await createItem({
        name: createName.trim(),
        notes: createNotes.trim() || null,
        isActive: createActive,
      });
      resetCreateForm();
      setShowCreate(false);
      await loadList();
    } catch (err) {
      const message = resolveErrorMessage(err);
      setCreateError(
        message === 'Datos inválidos.'
          ? 'Completá los campos requeridos.'
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: ClinicalProfileItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditNotes(item.notes ?? '');
    setEditActive(item.isActive ?? true);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditNotes('');
    setEditActive(true);
    setEditError(null);
  };

  const handleUpdate = async () => {
    if (!editingId) {
      return;
    }
    if (!editName.trim()) {
      setEditError('El nombre es requerido.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await updateItem(editingId, {
        name: editName.trim(),
        notes: editNotes.trim() || null,
        isActive: editActive,
      });
      handleCancelEdit();
      await loadList();
    } catch (err) {
      const message = resolveErrorMessage(err);
      setEditError(
        message === 'Datos inválidos.'
          ? 'Completá los campos requeridos.'
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: ClinicalProfileItem) => {
    if (typeof item.isActive !== 'boolean') {
      return;
    }
    setTogglingId(item.id);
    try {
      await updateItem(item.id, {
        isActive: !item.isActive,
        endedAt: item.isActive ? new Date().toISOString() : null,
      });
      await loadList();
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (item: ClinicalProfileItem) => {
    const confirmed = window.confirm(`¿Eliminar ${title.toLowerCase()}?`);
    if (!confirmed) {
      return;
    }
    setDeletingId(item.id);
    try {
      await deleteItem(item.id);
      await loadList();
    } catch (err) {
      setError(resolveErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const createForm = showCreate ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        border: '1px solid #e5e5e5',
        borderRadius: '6px',
        backgroundColor: '#fafafa',
      }}
    >
      <input
        value={createName}
        onChange={(event) => setCreateName(event.target.value)}
        placeholder="Nombre"
        disabled={saving}
        style={{
          padding: '8px 12px',
          border: '1px solid #d4d4d4',
          borderRadius: '6px',
          fontSize: '14px',
        }}
      />
      <textarea
        value={createNotes}
        onChange={(event) => setCreateNotes(event.target.value)}
        placeholder="Notas (opcional)"
        disabled={saving}
        style={{
          padding: '10px 12px',
          border: '1px solid #d4d4d4',
          borderRadius: '6px',
          fontSize: '14px',
          fontFamily: 'inherit',
          minHeight: '80px',
        }}
      />
      <label style={{ fontSize: '13px', color: '#404040' }}>
        <input
          type="checkbox"
          checked={createActive}
          onChange={(event) => setCreateActive(event.target.checked)}
          disabled={saving}
          style={{ marginRight: '6px' }}
        />
        Activo
      </label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleCreate()}
          disabled={saving}
          style={{
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: saving ? '#9ca3af' : '#007bff',
            color: 'white',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={() => {
            resetCreateForm();
            setShowCreate(false);
          }}
          disabled={saving}
          style={{
            padding: '8px 12px',
            border: '1px solid #d4d4d4',
            borderRadius: '4px',
            backgroundColor: '#fff',
            color: '#404040',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          Cancelar
        </button>
      </div>
      {createError && (
        <div style={{ fontSize: '12px', color: '#b91c1c' }}>{createError}</div>
      )}
    </div>
  ) : null;

  return (
    <ClinicalProfileListSection
      title={title}
      items={items}
      loading={loading}
      error={error}
      emptyText={emptyText}
      pageInfo={pageInfo}
      onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
      onNext={() => setPage((prev) => prev + 1)}
      headerAction={
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
          }}
          disabled={showCreate}
          style={{
            padding: '6px 10px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: showCreate ? '#9ca3af' : '#28a745',
            color: 'white',
            cursor: showCreate ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          }}
        >
          + Agregar
        </button>
      }
      headerContent={createForm}
      renderItemActions={(item) => (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleStartEdit(item)}
            disabled={
              saving || deletingId === item.id || togglingId === item.id
            }
            style={{
              padding: '4px 8px',
              border: '1px solid #d4d4d4',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#404040',
              cursor:
                saving || deletingId === item.id || togglingId === item.id
                  ? 'not-allowed'
                  : 'pointer',
              fontSize: '12px',
            }}
          >
            Editar
          </button>
          {typeof item.isActive === 'boolean' && (
            <button
              onClick={() => void handleToggleActive(item)}
              disabled={
                saving || togglingId === item.id || deletingId === item.id
              }
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: item.isActive ? '#f59e0b' : '#16a34a',
                color: 'white',
                cursor:
                  saving || togglingId === item.id || deletingId === item.id
                    ? 'not-allowed'
                    : 'pointer',
                fontSize: '12px',
              }}
            >
              {togglingId === item.id
                ? 'Guardando...'
                : item.isActive
                  ? 'Marcar inactiva'
                  : 'Reactivar'}
            </button>
          )}
          <button
            onClick={() => void handleDelete(item)}
            disabled={saving || deletingId === item.id}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#dc3545',
              color: 'white',
              cursor:
                saving || deletingId === item.id ? 'not-allowed' : 'pointer',
              fontSize: '12px',
            }}
          >
            {deletingId === item.id ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      )}
      renderItemFooter={(item) =>
        editingId === item.id ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '8px',
              padding: '10px',
              borderRadius: '6px',
              backgroundColor: '#f9fafb',
            }}
          >
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Nombre"
              disabled={saving}
              style={{
                padding: '8px 12px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <textarea
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              placeholder="Notas (opcional)"
              disabled={saving}
              style={{
                padding: '10px 12px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                minHeight: '80px',
              }}
            />
            <label style={{ fontSize: '13px', color: '#404040' }}>
              <input
                type="checkbox"
                checked={editActive}
                onChange={(event) => setEditActive(event.target.checked)}
                disabled={saving}
                style={{ marginRight: '6px' }}
              />
              Activo
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => void handleUpdate()}
                disabled={saving}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: saving ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  color: '#404040',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancelar
              </button>
            </div>
            {editError && (
              <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                {editError}
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
}
