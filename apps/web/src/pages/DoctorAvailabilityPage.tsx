import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  getAvailabilityRules,
  updateAvailabilityRules,
  listAvailabilityExceptions,
  createAvailabilityException,
  deleteAvailabilityException,
  type AvailabilityRule,
  type AvailabilityRuleInput,
  type AvailabilityException,
  type AvailabilityExceptionCreateRequest,
  type AvailabilityWindow,
} from '../api/scheduling';
import { getDoctorProfile } from '../api/doctor-profile';
import { type ProblemDetails } from '../api/http';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export function DoctorAvailabilityPage() {
  const navigate = useNavigate();
  const { activeRole, getActiveToken } = useAuth();

  // Redirect if not doctor
  useEffect(() => {
    if (activeRole !== 'doctor') {
      navigate('/lobby');
    }
  }, [activeRole, navigate]);

  // Rules state
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesError, setRulesError] = useState<ProblemDetails | null>(null);
  const [rulesSuccess, setRulesSuccess] = useState(false);

  // Local rules editing state (for form)
  const [editingRules, setEditingRules] = useState<
    Record<number, AvailabilityRuleInput[]>
  >({});

  // Exceptions state
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [creatingException, setCreatingException] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<ProblemDetails | null>(
    null,
  );
  const [exceptionsSuccess, setExceptionsSuccess] = useState(false);

  // Exception form state
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionType, setExceptionType] = useState<'closed' | 'custom'>(
    'closed',
  );
  const [customWindows, setCustomWindows] = useState<AvailabilityWindow[]>([
    { startTime: '09:00', endTime: '12:00' },
  ]);

  // Exception list date range
  const [exceptionsFrom, setExceptionsFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [exceptionsTo, setExceptionsTo] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return date.toISOString().split('T')[0];
  });

  // Load rules on mount
  useEffect(() => {
    const loadRules = async () => {
      if (!getActiveToken() || activeRole !== 'doctor') {
        return;
      }

      setLoadingRules(true);
      setRulesError(null);
      try {
        const data = await getAvailabilityRules();
        setRules(data);

        // Initialize editing rules from loaded data
        const grouped: Record<number, AvailabilityRuleInput[]> = {};
        for (const rule of data) {
          if (!grouped[rule.dayOfWeek]) {
            grouped[rule.dayOfWeek] = [];
          }
          grouped[rule.dayOfWeek].push({
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            isActive: rule.isActive,
          });
        }
        setEditingRules(grouped);
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setRulesError(apiError.problemDetails);
        } else {
          setRulesError({
            status: apiError.status || 500,
            detail: 'Error al cargar reglas',
          });
        }
      } finally {
        setLoadingRules(false);
      }
    };

    void loadRules();
  }, [getActiveToken, activeRole]);

  // Load exceptions when date range changes
  useEffect(() => {
    const loadExceptions = async () => {
      if (!getActiveToken() || activeRole !== 'doctor') {
        return;
      }

      if (!exceptionsFrom || !exceptionsTo) {
        return;
      }

      setLoadingExceptions(true);
      setExceptionsError(null);
      try {
        const data = await listAvailabilityExceptions({
          from: exceptionsFrom,
          to: exceptionsTo,
        });
        setExceptions(data);
      } catch (err) {
        const apiError = err as {
          problemDetails?: ProblemDetails;
          status?: number;
        };
        if (apiError.problemDetails) {
          setExceptionsError(apiError.problemDetails);
        } else {
          setExceptionsError({
            status: apiError.status || 500,
            detail: 'Error al cargar excepciones',
          });
        }
      } finally {
        setLoadingExceptions(false);
      }
    };

    void loadExceptions();
  }, [exceptionsFrom, exceptionsTo, getActiveToken, activeRole]);

  // Handle save rules
  const handleSaveRules = async () => {
    if (!getActiveToken()) {
      return;
    }

    // Validate rules
    const allRules: AvailabilityRuleInput[] = [];
    for (const dayRules of Object.values(editingRules)) {
      for (const rule of dayRules) {
        // Validate startTime < endTime
        if (rule.startTime >= rule.endTime) {
          setRulesError({
            status: 422,
            detail: `Hora de inicio debe ser menor que hora de fin para ${DAYS_OF_WEEK.find((d) => d.value === rule.dayOfWeek)?.label}`,
          });
          return;
        }
        allRules.push({
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isActive: rule.isActive ?? true,
        });
      }
    }

    setSavingRules(true);
    setRulesError(null);
    setRulesSuccess(false);

    try {
      const data = await updateAvailabilityRules({ rules: allRules });
      setRules(data);
      setRulesSuccess(true);
      setTimeout(() => setRulesSuccess(false), 3000);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setRulesError(apiError.problemDetails);
      } else {
        setRulesError({
          status: apiError.status || 500,
          detail: 'Error al guardar reglas',
        });
      }
    } finally {
      setSavingRules(false);
    }
  };

  // Handle add rule for a day
  const handleAddRule = (dayOfWeek: number) => {
    const dayRules = editingRules[dayOfWeek] || [];
    setEditingRules({
      ...editingRules,
      [dayOfWeek]: [
        ...dayRules,
        {
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          isActive: true,
        },
      ],
    });
  };

  // Handle remove rule
  const handleRemoveRule = (dayOfWeek: number, index: number) => {
    const dayRules = editingRules[dayOfWeek] || [];
    const updated = dayRules.filter((_, i) => i !== index);
    if (updated.length === 0) {
      const { [dayOfWeek]: _, ...rest } = editingRules;
      setEditingRules(rest);
    } else {
      setEditingRules({
        ...editingRules,
        [dayOfWeek]: updated,
      });
    }
  };

  // Handle update rule
  const handleUpdateRule = (
    dayOfWeek: number,
    index: number,
    field: keyof AvailabilityRuleInput,
    value: string | boolean,
  ) => {
    const dayRules = editingRules[dayOfWeek] || [];
    const updated = [...dayRules];
    updated[index] = { ...updated[index], [field]: value };
    setEditingRules({
      ...editingRules,
      [dayOfWeek]: updated,
    });
  };

  // Handle create exception
  const handleCreateException = async () => {
    if (!getActiveToken() || !exceptionDate) {
      return;
    }

    // Validate custom windows if type is custom
    if (exceptionType === 'custom') {
      for (const window of customWindows) {
        if (window.startTime >= window.endTime) {
          setExceptionsError({
            status: 422,
            detail: 'Hora de inicio debe ser menor que hora de fin',
          });
          return;
        }
      }
    }

    setCreatingException(true);
    setExceptionsError(null);
    setExceptionsSuccess(false);

    try {
      const request: AvailabilityExceptionCreateRequest = {
        date: exceptionDate,
        type: exceptionType,
      };

      if (exceptionType === 'custom') {
        request.customWindows = customWindows;
      }

      await createAvailabilityException(request);

      // Reset form
      setExceptionDate('');
      setExceptionType('closed');
      setCustomWindows([{ startTime: '09:00', endTime: '12:00' }]);
      setExceptionsSuccess(true);
      setTimeout(() => setExceptionsSuccess(false), 3000);

      // Reload exceptions
      const data = await listAvailabilityExceptions({
        from: exceptionsFrom,
        to: exceptionsTo,
      });
      setExceptions(data);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setExceptionsError(apiError.problemDetails);
      } else {
        setExceptionsError({
          status: apiError.status || 500,
          detail: 'Error al crear excepción',
        });
      }
    } finally {
      setCreatingException(false);
    }
  };

  // Handle delete exception
  const handleDeleteException = async (id: string) => {
    if (!getActiveToken()) {
      return;
    }

    try {
      await deleteAvailabilityException(id);
      // Reload exceptions
      const data = await listAvailabilityExceptions({
        from: exceptionsFrom,
        to: exceptionsTo,
      });
      setExceptions(data);
    } catch (err) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
      };
      if (apiError.problemDetails) {
        setExceptionsError(apiError.problemDetails);
      } else {
        setExceptionsError({
          status: apiError.status || 500,
          detail: 'Error al eliminar excepción',
        });
      }
    }
  };

  // Handle add custom window
  const handleAddCustomWindow = () => {
    setCustomWindows([
      ...customWindows,
      { startTime: '09:00', endTime: '12:00' },
    ]);
  };

  // Handle remove custom window
  const handleRemoveCustomWindow = (index: number) => {
    setCustomWindows(customWindows.filter((_, i) => i !== index));
  };

  // Handle update custom window
  const handleUpdateCustomWindow = (
    index: number,
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    const updated = [...customWindows];
    updated[index] = { ...updated[index], [field]: value };
    setCustomWindows(updated);
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
        <h1 style={{ margin: 0 }}>Mi Disponibilidad</h1>
        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Volver al Lobby
        </button>
      </div>

      {/* Rules Section */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Reglas Semanales</h2>

        {loadingRules && (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            Cargando reglas...
          </div>
        )}

        {!loadingRules && (
          <>
            {DAYS_OF_WEEK.map((day) => {
              const dayRules = editingRules[day.value] || [];
              return (
                <div
                  key={day.value}
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <strong>{day.label}</strong>
                    <button
                      onClick={() => handleAddRule(day.value)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      + Agregar
                    </button>
                  </div>

                  {dayRules.length === 0 ? (
                    <div style={{ color: '#666', fontSize: '14px' }}>
                      Sin horarios configurados
                    </div>
                  ) : (
                    dayRules.map((rule, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          marginBottom: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <label
                          style={{ display: 'flex', alignItems: 'center' }}
                        >
                          <input
                            type="checkbox"
                            checked={rule.isActive ?? true}
                            onChange={(e) =>
                              handleUpdateRule(
                                day.value,
                                index,
                                'isActive',
                                e.target.checked,
                              )
                            }
                            style={{ marginRight: '4px' }}
                          />
                          Activo
                        </label>
                        <input
                          type="time"
                          value={rule.startTime}
                          onChange={(e) =>
                            handleUpdateRule(
                              day.value,
                              index,
                              'startTime',
                              e.target.value,
                            )
                          }
                          style={{
                            padding: '4px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                          }}
                        />
                        <span>-</span>
                        <input
                          type="time"
                          value={rule.endTime}
                          onChange={(e) =>
                            handleUpdateRule(
                              day.value,
                              index,
                              'endTime',
                              e.target.value,
                            )
                          }
                          style={{
                            padding: '4px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                          }}
                        />
                        <button
                          onClick={() => handleRemoveRule(day.value, index)}
                          style={{
                            padding: '4px 8px',
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
                      </div>
                    ))
                  )}
                </div>
              );
            })}

            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => void handleSaveRules()}
                disabled={savingRules}
                style={{
                  padding: '10px 20px',
                  backgroundColor: savingRules ? '#ccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: savingRules ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                }}
              >
                {savingRules ? 'Guardando...' : 'Guardar Reglas'}
              </button>
            </div>

            {rulesError && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#fee',
                  border: '1px solid #fcc',
                  borderRadius: '4px',
                  color: '#c33',
                }}
              >
                <strong>Error {rulesError.status}:</strong> {rulesError.detail}
                {rulesError.errors && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    {Object.entries(rulesError.errors).map(
                      ([field, messages]) => (
                        <li key={field}>
                          <strong>{field}:</strong> {messages.join(', ')}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            )}

            {rulesSuccess && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#d4edda',
                  border: '1px solid #c3e6cb',
                  borderRadius: '4px',
                  color: '#155724',
                }}
              >
                Reglas guardadas exitosamente
              </div>
            )}
          </>
        )}
      </div>

      {/* Exceptions Section */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Excepciones</h2>

        {/* Create Exception Form */}
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Crear Excepción</h3>

          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
              }}
            >
              Fecha
            </label>
            <input
              type="date"
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
              style={{
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '200px',
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: 'bold',
              }}
            >
              Tipo
            </label>
            <select
              value={exceptionType}
              onChange={(e) =>
                setExceptionType(e.target.value as 'closed' | 'custom')
              }
              style={{
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                width: '200px',
              }}
            >
              <option value="closed">Cerrar día</option>
              <option value="custom">Horarios especiales</option>
            </select>
          </div>

          {exceptionType === 'custom' && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <label style={{ fontWeight: 'bold' }}>
                  Ventanas de Horario
                </label>
                <button
                  onClick={handleAddCustomWindow}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  + Agregar
                </button>
              </div>

              {customWindows.map((window, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <input
                    type="time"
                    value={window.startTime}
                    onChange={(e) =>
                      handleUpdateCustomWindow(
                        index,
                        'startTime',
                        e.target.value,
                      )
                    }
                    style={{
                      padding: '4px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <span>-</span>
                  <input
                    type="time"
                    value={window.endTime}
                    onChange={(e) =>
                      handleUpdateCustomWindow(index, 'endTime', e.target.value)
                    }
                    style={{
                      padding: '4px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  {customWindows.length > 1 && (
                    <button
                      onClick={() => handleRemoveCustomWindow(index)}
                      style={{
                        padding: '4px 8px',
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
              ))}
            </div>
          )}

          <button
            onClick={() => void handleCreateException()}
            disabled={!exceptionDate || creatingException}
            style={{
              padding: '10px 20px',
              backgroundColor:
                !exceptionDate || creatingException ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor:
                !exceptionDate || creatingException ? 'not-allowed' : 'pointer',
            }}
          >
            {creatingException ? 'Creando...' : 'Crear Excepción'}
          </button>
        </div>

        {/* Exceptions List */}
        <div>
          <h3 style={{ marginTop: 0 }}>Excepciones Existentes</h3>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
              alignItems: 'center',
            }}
          >
            <label style={{ fontWeight: 'bold' }}>Desde:</label>
            <input
              type="date"
              value={exceptionsFrom}
              onChange={(e) => setExceptionsFrom(e.target.value)}
              style={{
                padding: '4px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <label style={{ fontWeight: 'bold' }}>Hasta:</label>
            <input
              type="date"
              value={exceptionsTo}
              onChange={(e) => setExceptionsTo(e.target.value)}
              style={{
                padding: '4px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <button
              onClick={() => {
                void listAvailabilityExceptions({
                  from: exceptionsFrom,
                  to: exceptionsTo,
                }).then(setExceptions);
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Refrescar
            </button>
          </div>

          {loadingExceptions && (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              Cargando excepciones...
            </div>
          )}

          {!loadingExceptions && exceptions.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px',
                color: '#666',
              }}
            >
              No hay excepciones en este rango
            </div>
          )}

          {!loadingExceptions && exceptions.length > 0 && (
            <div>
              {exceptions.map((exception) => (
                <div
                  key={exception.id}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{exception.date}</strong> -{' '}
                    {exception.type === 'closed' ? (
                      <span style={{ color: '#dc3545' }}>Cerrado</span>
                    ) : (
                      <span style={{ color: '#007bff' }}>
                        Horarios especiales:{' '}
                        {exception.customWindows
                          ?.map((w) => `${w.startTime}-${w.endTime}`)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void handleDeleteException(exception.id)}
                    style={{
                      padding: '4px 8px',
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
                </div>
              ))}
            </div>
          )}

          {exceptionsError && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '4px',
                color: '#c33',
              }}
            >
              <strong>Error {exceptionsError.status}:</strong>{' '}
              {exceptionsError.detail}
              {exceptionsError.errors && (
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  {Object.entries(exceptionsError.errors).map(
                    ([field, messages]) => (
                      <li key={field}>
                        <strong>{field}:</strong> {messages.join(', ')}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}

          {exceptionsSuccess && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#d4edda',
                border: '1px solid #c3e6cb',
                borderRadius: '4px',
                color: '#155724',
              }}
            >
              Excepción creada exitosamente
            </div>
          )}
        </div>
      </div>

      {/* Doctor Profile Link */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Perfil del Médico</h2>
        <p>
          Para editar tu perfil (nombre, bio, precio, etc.), puedes usar el
          formulario en el Lobby o{' '}
          <button
            onClick={() => navigate('/lobby')}
            style={{
              padding: '4px 8px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ir al Lobby
          </button>
        </p>
      </div>
    </div>
  );
}
