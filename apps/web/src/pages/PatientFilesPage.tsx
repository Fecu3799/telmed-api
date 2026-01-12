import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  listFiles,
  listFilesForPatient,
  uploadFile,
  getDownloadUrl,
  getDownloadUrlForPatient,
  deleteFile,
  deleteFileForPatient,
  type PatientFile,
  type PatientFileCategory,
  type ListFilesQuery,
} from '../api/patient-files';
import { getCurrentTraceId, type ProblemDetails } from '../api/http';
import { getMe, type AuthMeResponse } from '../api/auth';

type UploadStage = 'idle' | 'preparing' | 'uploading' | 'confirming';

export function PatientFilesPage() {
  const { activeRole, getActiveToken } = useAuth();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState<PatientFileCategory | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [relatedConsultationId, setRelatedConsultationId] = useState('');

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] =
    useState<PatientFileCategory>('other');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadConsultationId, setUploadConsultationId] = useState('');
  const [calculateChecksum, setCalculateChecksum] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Doctor mode: patient selector
  const [patientId, setPatientId] = useState('');
  const [sessionStatus, setSessionStatus] = useState<AuthMeResponse | null>(
    null,
  );

  // Load session status for doctor mode
  useEffect(() => {
    const loadSession = async () => {
      if (activeRole !== 'doctor' || !getActiveToken()) {
        setSessionStatus(null);
        return;
      }

      try {
        const status = await getMe();
        setSessionStatus(status);
      } catch {
        setSessionStatus(null);
      }
    };

    void loadSession();
  }, [activeRole, getActiveToken]);

  // Load files
  const loadFiles = useCallback(async () => {
    if (!getActiveToken()) {
      return;
    }

    setLoadingFiles(true);
    setError(null);
    setTraceId(null);

    try {
      const query: ListFilesQuery = {
        cursor,
        limit: 50,
        category: category || undefined,
        q: searchQuery || undefined,
        relatedConsultationId: relatedConsultationId || undefined,
        status: 'ready',
      };

      const response =
        activeRole === 'doctor' && patientId
          ? await listFilesForPatient(patientId, query)
          : await listFiles(query);

      setFiles(response.items);
      setHasNextPage(response.pageInfo.hasNextPage);
      setCursor(response.pageInfo.endCursor || undefined);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const problemDetails = apiError.problemDetails;
      const currentTraceId = getCurrentTraceId();
      setError(problemDetails?.detail || 'Failed to load files');
      setTraceId(currentTraceId);
      if (import.meta.env.DEV && problemDetails) {
        console.error('[PatientFiles] Error loading files:', {
          problemDetails,
          traceId: currentTraceId,
        });
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [
    getActiveToken,
    activeRole,
    patientId,
    cursor,
    category,
    searchQuery,
    relatedConsultationId,
  ]);

  // Load files on mount and when filters change
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStage('preparing');
    setUploadError(null);
    setTraceId(null);

    try {
      await uploadFile(selectedFile, {
        category: uploadCategory,
        notes: uploadNotes || undefined,
        relatedConsultationId: uploadConsultationId || undefined,
        calculateChecksum,
        onProgress: (stage) => {
          setUploadStage(stage);
        },
      });

      // Reset upload form
      setSelectedFile(null);
      setUploadNotes('');
      setUploadConsultationId('');
      setUploadStage('idle');

      // Reload files list
      void loadFiles();
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const problemDetails = apiError.problemDetails;
      const currentTraceId = getCurrentTraceId();
      setUploadError(
        problemDetails?.detail || 'Failed to upload file. Please try again.',
      );
      setUploadStage('idle');
      setTraceId(currentTraceId);
      if (import.meta.env.DEV && problemDetails) {
        console.error('[PatientFiles] Error uploading file:', {
          problemDetails,
          traceId: currentTraceId,
        });
      }
    }
  };

  // Handle download
  const handleDownload = async (file: PatientFile) => {
    try {
      const response =
        activeRole === 'doctor' && patientId
          ? await getDownloadUrlForPatient(patientId, file.id)
          : await getDownloadUrl(file.id);

      // Open download URL in new tab
      window.open(response.downloadUrl, '_blank');
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const problemDetails = apiError.problemDetails;
      alert(
        problemDetails?.detail ||
          'Failed to get download URL. Please try again.',
      );
      if (import.meta.env.DEV && problemDetails) {
        console.error('[PatientFiles] Error downloading file:', {
          problemDetails,
          traceId: getCurrentTraceId(),
        });
      }
    }
  };

  // Handle delete
  const handleDelete = async (file: PatientFile) => {
    if (!confirm(`Are you sure you want to delete "${file.originalName}"?`)) {
      return;
    }

    try {
      if (activeRole === 'doctor' && patientId) {
        await deleteFileForPatient(patientId, file.id);
      } else {
        await deleteFile(file.id);
      }

      // Reload files list (don't await to avoid blocking)
      void loadFiles();
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      const problemDetails = apiError.problemDetails;
      const currentTraceId = getCurrentTraceId();
      alert(
        problemDetails?.detail || 'Failed to delete file. Please try again.',
      );
      if (import.meta.env.DEV && problemDetails) {
        console.error('[PatientFiles] Error deleting file:', {
          problemDetails,
          traceId: currentTraceId,
        });
      }
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const canUpload =
    activeRole === 'patient' || (activeRole === 'doctor' && patientId);

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Archivos del Paciente</h1>

      {/* Doctor mode: patient selector */}
      {activeRole === 'doctor' && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <label style={{ display: 'block', marginBottom: '8px' }}>
            <strong>Patient ID (para pruebas):</strong>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Ingresa patientUserId (o deja vacío para usar /patients/me)"
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            {sessionStatus && (
              <span style={{ padding: '8px', color: '#666' }}>
                Tu ID: {sessionStatus.id}
              </span>
            )}
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
            {patientId
              ? `Usando: /patients/${patientId}/files`
              : 'Usando: /patients/me/files (requiere login como patient)'}
          </div>
        </div>
      )}

      {/* Upload Section */}
      {canUpload && (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fafafa',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Subir Archivo</h2>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Archivo:
              </label>
              <input
                type="file"
                onChange={handleFileSelect}
                style={{ width: '100%' }}
              />
              {selectedFile && (
                <div
                  style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}
                >
                  {selectedFile.name} ({formatFileSize(selectedFile.size)}) -{' '}
                  {selectedFile.type || 'application/octet-stream'}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Categoría:
              </label>
              <select
                value={uploadCategory}
                onChange={(e) =>
                  setUploadCategory(e.target.value as PatientFileCategory)
                }
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              >
                <option value="lab">Laboratorio</option>
                <option value="image">Imagen</option>
                <option value="prescription">Receta</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Notas (opcional):
              </label>
              <input
                type="text"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Descripción del archivo"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px' }}>
                Consultation ID (opcional):
              </label>
              <input
                type="text"
                value={uploadConsultationId}
                onChange={(e) => setUploadConsultationId(e.target.value)}
                placeholder="ID de consulta relacionada"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                }}
              />
            </div>

            <div>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <input
                  type="checkbox"
                  checked={calculateChecksum}
                  onChange={(e) => setCalculateChecksum(e.target.checked)}
                />
                Calcular SHA-256 checksum
              </label>
            </div>

            <button
              onClick={() => {
                void handleUpload();
              }}
              disabled={!selectedFile || uploadStage !== 'idle'}
              style={{
                padding: '10px 20px',
                backgroundColor:
                  !selectedFile || uploadStage !== 'idle' ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor:
                  !selectedFile || uploadStage !== 'idle'
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {uploadStage === 'idle'
                ? 'Subir'
                : uploadStage === 'preparing'
                  ? 'Preparando...'
                  : uploadStage === 'uploading'
                    ? 'Subiendo...'
                    : uploadStage === 'confirming'
                      ? 'Confirmando...'
                      : 'Subir'}
            </button>

            {uploadError && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: '4px',
                  color: '#c00',
                }}
              >
                <strong>Error:</strong> {uploadError}
                {traceId && import.meta.env.DEV && (
                  <div style={{ marginTop: '4px', fontSize: '12px' }}>
                    Trace ID: {traceId}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          marginBottom: '16px',
          padding: '12px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Categoría:
          </label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as PatientFileCategory | '')
            }
            style={{
              width: '100%',
              padding: '6px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          >
            <option value="">Todas</option>
            <option value="lab">Laboratorio</option>
            <option value="image">Imagen</option>
            <option value="prescription">Receta</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Buscar:
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre"
            style={{
              width: '100%',
              padding: '6px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Consultation ID:
          </label>
          <input
            type="text"
            value={relatedConsultationId}
            onChange={(e) => setRelatedConsultationId(e.target.value)}
            placeholder="Filtrar por consulta"
            style={{
              width: '100%',
              padding: '6px',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            onClick={() => {
              setCursor(undefined);
              void loadFiles();
            }}
            type="button"
            style={{
              padding: '6px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Refrescar
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c00',
          }}
        >
          <strong>Error:</strong> {error}
          {traceId && import.meta.env.DEV && (
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              Trace ID: {traceId}
            </div>
          )}
        </div>
      )}

      {/* Files List */}
      <div
        style={{
          border: '1px solid #ccc',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        {loadingFiles ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            Cargando archivos...
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            No hay archivos disponibles
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Nombre
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Categoría
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Tamaño
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Subido por
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Fecha
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {file.originalName}
                    </div>
                    {file.notes && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#666',
                          marginTop: '4px',
                        }}
                      >
                        {file.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      {file.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {formatFileSize(file.sizeBytes)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div>{file.uploadedByRole}</div>
                    {file.relatedConsultationId && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#666',
                          marginTop: '4px',
                        }}
                      >
                        Consulta: {file.relatedConsultationId.slice(0, 8)}...
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {formatDate(file.createdAt)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          void handleDownload(file);
                        }}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Descargar
                      </button>
                      {canUpload && (
                        <button
                          onClick={() => {
                            void handleDelete(file);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {hasNextPage && (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              borderTop: '1px solid #ccc',
            }}
          >
            <button
              onClick={() => {
                setCursor(cursor);
                void loadFiles();
              }}
              disabled={loadingFiles}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loadingFiles ? 'not-allowed' : 'pointer',
              }}
            >
              Cargar más
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
