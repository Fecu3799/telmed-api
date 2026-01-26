import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import {
  getClinicalEpisode,
  listDoctorPatientConsultations,
  type ClinicalEpisodeResponse,
  type ConsultationHistoryItem,
} from '../api/consultations';
import {
  getPatientClinicalAllergies,
  getPatientClinicalConditions,
  getPatientClinicalMedications,
  getPatientClinicalProcedures,
  type ClinicalProfileItem,
  type ClinicalProfilePageInfo,
  verifyPatientAllergy,
  disputePatientAllergy,
  verifyPatientMedication,
  disputePatientMedication,
  verifyPatientCondition,
  disputePatientCondition,
  verifyPatientProcedure,
  disputePatientProcedure,
} from '../api/clinical-profile';
import type { ProblemDetails } from '../api/http';
import { ClinicalProfileListSection } from '../components/ClinicalProfileListSection';

export function DoctorPatientHistoryPage() {
  const navigate = useNavigate();
  const { patientId } = useParams<{ patientId: string }>();
  const { activeRole } = useAuth();
  const [consultationId, setConsultationId] = useState('');
  const [episode, setEpisode] = useState<ClinicalEpisodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [consultations, setConsultations] = useState<ConsultationHistoryItem[]>(
    [],
  );
  const [consultationsLoading, setConsultationsLoading] = useState(false);
  const [consultationsError, setConsultationsError] =
    useState<ProblemDetails | null>(null);
  const [allergies, setAllergies] = useState<ClinicalProfileItem[]>([]);
  const [allergiesLoading, setAllergiesLoading] = useState(false);
  const [allergiesError, setAllergiesError] = useState<string | null>(null);
  const [allergiesPage, setAllergiesPage] = useState(1);
  const [allergiesPageInfo, setAllergiesPageInfo] =
    useState<ClinicalProfilePageInfo | null>(null);
  const [allergiesActionError, setAllergiesActionError] = useState<
    string | null
  >(null);
  const [allergiesActionLoadingId, setAllergiesActionLoadingId] = useState<
    string | null
  >(null);
  const [medications, setMedications] = useState<ClinicalProfileItem[]>([]);
  const [medicationsLoading, setMedicationsLoading] = useState(false);
  const [medicationsError, setMedicationsError] = useState<string | null>(null);
  const [medicationsPage, setMedicationsPage] = useState(1);
  const [medicationsPageInfo, setMedicationsPageInfo] =
    useState<ClinicalProfilePageInfo | null>(null);
  const [medicationsActionError, setMedicationsActionError] = useState<
    string | null
  >(null);
  const [medicationsActionLoadingId, setMedicationsActionLoadingId] = useState<
    string | null
  >(null);
  const [conditions, setConditions] = useState<ClinicalProfileItem[]>([]);
  const [conditionsLoading, setConditionsLoading] = useState(false);
  const [conditionsError, setConditionsError] = useState<string | null>(null);
  const [conditionsPage, setConditionsPage] = useState(1);
  const [conditionsPageInfo, setConditionsPageInfo] =
    useState<ClinicalProfilePageInfo | null>(null);
  const [conditionsActionError, setConditionsActionError] = useState<
    string | null
  >(null);
  const [conditionsActionLoadingId, setConditionsActionLoadingId] = useState<
    string | null
  >(null);
  const [procedures, setProcedures] = useState<ClinicalProfileItem[]>([]);
  const [proceduresLoading, setProceduresLoading] = useState(false);
  const [proceduresError, setProceduresError] = useState<string | null>(null);
  const [proceduresPage, setProceduresPage] = useState(1);
  const [proceduresPageInfo, setProceduresPageInfo] =
    useState<ClinicalProfilePageInfo | null>(null);
  const [proceduresActionError, setProceduresActionError] = useState<
    string | null
  >(null);
  const [proceduresActionLoadingId, setProceduresActionLoadingId] = useState<
    string | null
  >(null);
  const [clinicalAccessError, setClinicalAccessError] = useState<string | null>(
    null,
  );

  const pageSize = 20;

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole && activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  useEffect(() => {
    if (!patientId) {
      return;
    }
    setAllergiesPage(1);
    setMedicationsPage(1);
    setConditionsPage(1);
    setProceduresPage(1);
  }, [patientId]);

  useEffect(() => {
    if (activeRole !== 'doctor' || !patientId) {
      return;
    }
    let cancelled = false;
    setConsultationsLoading(true);
    setConsultationsError(null);
    listDoctorPatientConsultations(patientId, { page: 1, pageSize: 50 })
      .then((response) => {
        if (cancelled) return;
        setConsultations(response.items);
      })
      .catch((err) => {
        if (cancelled) return;
        const apiError = err as { problemDetails?: ProblemDetails };
        setConsultationsError(
          apiError.problemDetails || {
            status: 500,
            detail: 'Error al cargar consultas',
          },
        );
        setConsultations([]);
      })
      .finally(() => {
        if (!cancelled) {
          setConsultationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRole, patientId]);

  const resolveClinicalError = useCallback(
    (err: unknown) => {
      const apiError = err as { problemDetails?: ProblemDetails };
      const status = apiError.problemDetails?.status;
      if (status === 403) {
        setClinicalAccessError(
          'No tenés acceso al perfil clínico de este paciente (solo disponible si ya tuviste una consulta con él).',
        );
        return null;
      }
      if (status === 401) {
        return 'No autorizado';
      }
      if (status === 404) {
        return 'No disponible.';
      }
      if (status === 409) {
        return 'No se puede verificar en este estado.';
      }
      if (status === 422) {
        return 'Datos inválidos.';
      }
      if (status === 429) {
        return 'Rate limited, reintentá en unos segundos';
      }
      return 'Error al cargar';
    },
    [setClinicalAccessError],
  );

  const loadClinicalList = useCallback(
    async (
      fetcher: (
        patientUserId: string,
        page?: number,
        pageSize?: number,
      ) => Promise<{
        items: ClinicalProfileItem[];
        pageInfo: ClinicalProfilePageInfo;
      }>,
      page: number,
      setItems: (items: ClinicalProfileItem[]) => void,
      setLoading: (loading: boolean) => void,
      setError: (error: string | null) => void,
      setPageInfo: (pageInfo: ClinicalProfilePageInfo | null) => void,
      setActionError: (error: string | null) => void,
    ) => {
      if (activeRole !== 'doctor' || !patientId) {
        return;
      }
      setLoading(true);
      setError(null);
      setActionError(null);
      try {
        const response = await fetcher(patientId, page, pageSize);
        setItems(response.items);
        setPageInfo(response.pageInfo);
      } catch (err) {
        setItems([]);
        setError(resolveClinicalError(err));
        setPageInfo(null);
      } finally {
        setLoading(false);
      }
    },
    [activeRole, pageSize, patientId, resolveClinicalError],
  );

  const loadAllergies = useCallback(() => {
    return loadClinicalList(
      getPatientClinicalAllergies,
      allergiesPage,
      setAllergies,
      setAllergiesLoading,
      setAllergiesError,
      setAllergiesPageInfo,
      setAllergiesActionError,
    );
  }, [allergiesPage, loadClinicalList]);

  const loadMedications = useCallback(() => {
    return loadClinicalList(
      getPatientClinicalMedications,
      medicationsPage,
      setMedications,
      setMedicationsLoading,
      setMedicationsError,
      setMedicationsPageInfo,
      setMedicationsActionError,
    );
  }, [loadClinicalList, medicationsPage]);

  const loadConditions = useCallback(() => {
    return loadClinicalList(
      getPatientClinicalConditions,
      conditionsPage,
      setConditions,
      setConditionsLoading,
      setConditionsError,
      setConditionsPageInfo,
      setConditionsActionError,
    );
  }, [conditionsPage, loadClinicalList]);

  const loadProcedures = useCallback(() => {
    return loadClinicalList(
      getPatientClinicalProcedures,
      proceduresPage,
      setProcedures,
      setProceduresLoading,
      setProceduresError,
      setProceduresPageInfo,
      setProceduresActionError,
    );
  }, [loadClinicalList, proceduresPage]);

  useEffect(() => {
    if (activeRole !== 'doctor' || !patientId) {
      return;
    }
    setClinicalAccessError(null);
    void loadAllergies();
    void loadMedications();
    void loadConditions();
    void loadProcedures();
  }, [
    activeRole,
    patientId,
    allergiesPage,
    medicationsPage,
    conditionsPage,
    proceduresPage,
    loadAllergies,
    loadMedications,
    loadConditions,
    loadProcedures,
  ]);

  useEffect(() => {
    if (consultationId || consultations.length === 0) {
      return;
    }
    const first = consultations[0];
    if (first?.id) {
      setConsultationId(first.id);
      void handleLoadEpisode(first.id);
    }
  }, [consultations, consultationId]);

  const handleVerification = useCallback(
    async (
      itemId: string,
      action: (
        patientUserId: string,
        id: string,
      ) => Promise<ClinicalProfileItem>,
      setLoadingId: (id: string | null) => void,
      setActionError: (error: string | null) => void,
      reload: () => Promise<void>,
    ) => {
      if (!patientId) {
        return;
      }
      setLoadingId(itemId);
      setActionError(null);
      try {
        await action(patientId, itemId);
        await reload();
      } catch (err) {
        const message = resolveClinicalError(err);
        if (message) {
          setActionError(message);
        }
      } finally {
        setLoadingId(null);
      }
    },
    [patientId, resolveClinicalError],
  );

  const handleLoadEpisode = async (id: string) => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getClinicalEpisode(id);
      setEpisode(result);
    } catch (err) {
      const apiError = err as { problemDetails?: ProblemDetails };
      setEpisode(null);
      setError(
        apiError.problemDetails ?? {
          status: 500,
          detail: 'No se pudieron cargar las notas.',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  const renderEpisode = () => {
    if (loading) {
      return <div style={{ fontSize: '14px' }}>Cargando notas...</div>;
    }
    if (error) {
      if (error.status === 404) {
        return (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            Aún no hay notas cargadas.
          </div>
        );
      }
      if (error.status === 403) {
        return (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            No disponible.
          </div>
        );
      }
      return (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
            fontSize: '13px',
          }}
        >
          {error.detail}
        </div>
      );
    }

    if (!episode) {
      return (
        <div style={{ fontSize: '14px', color: '#737373' }}>
          Seleccioná una consulta para ver sus notas.
        </div>
      );
    }

    const finalNote = episode.final;
    const draft = episode.draft;
    const addendums = episode.addendums ?? [];
    const sortedAddendums = [...addendums].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const finalDisplay =
      finalNote?.displayBody ??
      finalNote?.formattedBody ??
      finalNote?.body ??
      '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {draft && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Borrador</div>
            <div style={{ fontSize: '13px', color: '#737373' }}>
              {draft.title}
            </div>
            <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {draft.body}
            </div>
          </div>
        )}
        {finalNote && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Final</div>
            <div style={{ fontSize: '13px', color: '#737373' }}>
              {finalNote.title}
            </div>
            <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {finalDisplay}
            </div>
          </div>
        )}
        {sortedAddendums.length > 0 && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Addendums</div>
            {sortedAddendums.map((note) => (
              <div key={note.id} style={{ fontSize: '14px' }}>
                <div style={{ fontSize: '13px', color: '#737373' }}>
                  {note.title} · {new Date(note.createdAt).toLocaleString()}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (activeRole !== 'doctor') {
    return null;
  }

  return (
    <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ margin: 0 }}>Historia Clínica</h1>
        <button
          onClick={() => navigate(`/doctor-patients/${patientId}`)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Consultas del paciente</h2>
        {consultationsLoading ? (
          <div style={{ fontSize: '14px' }}>Cargando consultas...</div>
        ) : consultationsError ? (
          <div style={{ fontSize: '14px', color: '#c33' }}>
            {consultationsError.detail}
          </div>
        ) : consultations.length === 0 ? (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            No hay consultas registradas para este paciente.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {consultations.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                }}
              >
                <div style={{ fontSize: '14px', color: '#404040' }}>
                  <div>
                    <strong>Fecha:</strong>{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <strong>Estado:</strong> {item.status}
                  </div>
                  {item.patient && (
                    <div>
                      <strong>Paciente:</strong> {item.patient.displayName}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!item.id) {
                      return;
                    }
                    setConsultationId(item.id);
                    void handleLoadEpisode(item.id);
                  }}
                  disabled={!item.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: item.id ? '#007bff' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: item.id ? 'pointer' : 'not-allowed',
                  }}
                >
                  Ver episodio
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <input
            value={consultationId}
            onChange={(event) => setConsultationId(event.target.value)}
            placeholder="Ingresá el ID de consulta (opcional)"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d4d4d4',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            onClick={() => void handleLoadEpisode(consultationId)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#6c757d',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Buscar por ID
          </button>
        </div>
        {patientId && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#737373' }}>
            Paciente: {patientId.slice(0, 8)}...
          </div>
        )}
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: 'white',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Notas del episodio</h2>
        {renderEpisode()}
      </div>

      <div style={{ marginTop: '16px' }}>
        <h2 style={{ marginTop: 0 }}>Perfil clínico</h2>
        {clinicalAccessError ? (
          <div style={{ fontSize: '14px', color: '#737373' }}>
            {clinicalAccessError}
          </div>
        ) : (
          <>
            <ClinicalProfileListSection
              title="Alergias"
              items={allergies}
              loading={allergiesLoading}
              error={allergiesError}
              emptyText="Sin alergias registradas."
              pageInfo={allergiesPageInfo}
              onPrev={() => setAllergiesPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setAllergiesPage((prev) => prev + 1)}
              footerContent={
                allergiesActionError ? (
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                    {allergiesActionError}
                  </div>
                ) : null
              }
              renderItemActions={(item) => (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.verificationStatus !== 'verified' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          verifyPatientAllergy,
                          setAllergiesActionLoadingId,
                          setAllergiesActionError,
                          loadAllergies,
                        )
                      }
                      disabled={allergiesActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          allergiesActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#16a34a',
                        color: 'white',
                        cursor:
                          allergiesActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {allergiesActionLoadingId === item.id
                        ? 'Verificando...'
                        : 'Verificar'}
                    </button>
                  )}
                  {item.verificationStatus !== 'disputed' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          disputePatientAllergy,
                          setAllergiesActionLoadingId,
                          setAllergiesActionError,
                          loadAllergies,
                        )
                      }
                      disabled={allergiesActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          allergiesActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#f59e0b',
                        color: 'white',
                        cursor:
                          allergiesActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {allergiesActionLoadingId === item.id
                        ? 'Actualizando...'
                        : 'Disputar'}
                    </button>
                  )}
                </div>
              )}
            />
            <ClinicalProfileListSection
              title="Medicación"
              items={medications}
              loading={medicationsLoading}
              error={medicationsError}
              emptyText="Sin medicación registrada."
              pageInfo={medicationsPageInfo}
              onPrev={() => setMedicationsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setMedicationsPage((prev) => prev + 1)}
              footerContent={
                medicationsActionError ? (
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                    {medicationsActionError}
                  </div>
                ) : null
              }
              renderItemActions={(item) => (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.verificationStatus !== 'verified' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          verifyPatientMedication,
                          setMedicationsActionLoadingId,
                          setMedicationsActionError,
                          loadMedications,
                        )
                      }
                      disabled={medicationsActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          medicationsActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#16a34a',
                        color: 'white',
                        cursor:
                          medicationsActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {medicationsActionLoadingId === item.id
                        ? 'Verificando...'
                        : 'Verificar'}
                    </button>
                  )}
                  {item.verificationStatus !== 'disputed' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          disputePatientMedication,
                          setMedicationsActionLoadingId,
                          setMedicationsActionError,
                          loadMedications,
                        )
                      }
                      disabled={medicationsActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          medicationsActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#f59e0b',
                        color: 'white',
                        cursor:
                          medicationsActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {medicationsActionLoadingId === item.id
                        ? 'Actualizando...'
                        : 'Disputar'}
                    </button>
                  )}
                </div>
              )}
            />
            <ClinicalProfileListSection
              title="Condiciones"
              items={conditions}
              loading={conditionsLoading}
              error={conditionsError}
              emptyText="Sin condiciones registradas."
              pageInfo={conditionsPageInfo}
              onPrev={() => setConditionsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setConditionsPage((prev) => prev + 1)}
              footerContent={
                conditionsActionError ? (
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                    {conditionsActionError}
                  </div>
                ) : null
              }
              renderItemActions={(item) => (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.verificationStatus !== 'verified' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          verifyPatientCondition,
                          setConditionsActionLoadingId,
                          setConditionsActionError,
                          loadConditions,
                        )
                      }
                      disabled={conditionsActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          conditionsActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#16a34a',
                        color: 'white',
                        cursor:
                          conditionsActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {conditionsActionLoadingId === item.id
                        ? 'Verificando...'
                        : 'Verificar'}
                    </button>
                  )}
                  {item.verificationStatus !== 'disputed' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          disputePatientCondition,
                          setConditionsActionLoadingId,
                          setConditionsActionError,
                          loadConditions,
                        )
                      }
                      disabled={conditionsActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          conditionsActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#f59e0b',
                        color: 'white',
                        cursor:
                          conditionsActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {conditionsActionLoadingId === item.id
                        ? 'Actualizando...'
                        : 'Disputar'}
                    </button>
                  )}
                </div>
              )}
            />
            <ClinicalProfileListSection
              title="Procedimientos"
              items={procedures}
              loading={proceduresLoading}
              error={proceduresError}
              emptyText="Sin procedimientos registrados."
              pageInfo={proceduresPageInfo}
              onPrev={() => setProceduresPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setProceduresPage((prev) => prev + 1)}
              footerContent={
                proceduresActionError ? (
                  <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                    {proceduresActionError}
                  </div>
                ) : null
              }
              renderItemActions={(item) => (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.verificationStatus !== 'verified' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          verifyPatientProcedure,
                          setProceduresActionLoadingId,
                          setProceduresActionError,
                          loadProcedures,
                        )
                      }
                      disabled={proceduresActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          proceduresActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#16a34a',
                        color: 'white',
                        cursor:
                          proceduresActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {proceduresActionLoadingId === item.id
                        ? 'Verificando...'
                        : 'Verificar'}
                    </button>
                  )}
                  {item.verificationStatus !== 'disputed' && (
                    <button
                      onClick={() =>
                        void handleVerification(
                          item.id,
                          disputePatientProcedure,
                          setProceduresActionLoadingId,
                          setProceduresActionError,
                          loadProcedures,
                        )
                      }
                      disabled={proceduresActionLoadingId === item.id}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor:
                          proceduresActionLoadingId === item.id
                            ? '#9ca3af'
                            : '#f59e0b',
                        color: 'white',
                        cursor:
                          proceduresActionLoadingId === item.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {proceduresActionLoadingId === item.id
                        ? 'Actualizando...'
                        : 'Disputar'}
                    </button>
                  )}
                </div>
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}
