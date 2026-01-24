import { useState, FormEvent } from 'react';
import { type ProblemDetails } from '../api/http';
import {
  type PatientIdentityPatch,
  patchPatientIdentity,
} from '../api/patient-identity';

interface PatientIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PatientIdentityModal({
  isOpen,
  onClose,
  onSuccess,
}: PatientIdentityModalProps) {
  const [formData, setFormData] = useState<PatientIdentityPatch>({
    legalFirstName: '',
    legalLastName: '',
    documentType: 'DNI',
    documentNumber: '',
    documentCountry: 'AR',
    birthDate: '',
    phone: '',
    addressText: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    insuranceName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleAutocomplete = () => {
    setFormData({
      legalFirstName: 'Juan',
      legalLastName: 'Perez',
      documentType: 'DNI',
      documentNumber: '30123456',
      documentCountry: 'AR',
      birthDate: '1990-05-10',
      phone: '+54 11 5555-5555',
      addressText: 'Av. Siempre Viva 123',
      emergencyContactName: 'Maria Perez',
      emergencyContactPhone: '+54 11 4444-4444',
      insuranceName: 'OSDE',
    });
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      await patchPatientIdentity(formData);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = err as {
        problemDetails?: ProblemDetails;
        status?: number;
        message?: string;
      };
      if (apiError.problemDetails) {
        setError(apiError.problemDetails);
        if (apiError.problemDetails.errors) {
          setFieldErrors(apiError.problemDetails.errors);
        }
      } else {
        setError({
          status: apiError.status || 500,
          detail: apiError.message || 'An error occurred',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Patient Identity</h2>

        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '4px',
              color: '#c33',
            }}
          >
            {error.detail}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              First Name *
            </label>
            <input
              type="text"
              value={formData.legalFirstName || ''}
              onChange={(e) =>
                setFormData({ ...formData, legalFirstName: e.target.value })
              }
              required
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            {fieldErrors.legalFirstName && (
              <div
                style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}
              >
                {fieldErrors.legalFirstName.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Last Name *
            </label>
            <input
              type="text"
              value={formData.legalLastName || ''}
              onChange={(e) =>
                setFormData({ ...formData, legalLastName: e.target.value })
              }
              required
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            {fieldErrors.legalLastName && (
              <div
                style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}
              >
                {fieldErrors.legalLastName.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Document Type
            </label>
            <select
              value={formData.documentType || 'DNI'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  documentType: e.target.value as any,
                })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            >
              <option value="DNI">DNI</option>
              <option value="PASSPORT">PASSPORT</option>
              <option value="LC">LC</option>
              <option value="LE">LE</option>
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Document Number
            </label>
            <input
              type="text"
              value={formData.documentNumber || ''}
              onChange={(e) =>
                setFormData({ ...formData, documentNumber: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            {fieldErrors.documentNumber && (
              <div
                style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}
              >
                {fieldErrors.documentNumber.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Document Country
            </label>
            <input
              type="text"
              value={formData.documentCountry || ''}
              onChange={(e) =>
                setFormData({ ...formData, documentCountry: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Birth Date
            </label>
            <input
              type="date"
              value={formData.birthDate || ''}
              onChange={(e) =>
                setFormData({ ...formData, birthDate: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Phone
            </label>
            <input
              type="text"
              value={formData.phone || ''}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Emergency Contact Name
            </label>
            <input
              type="text"
              value={formData.emergencyContactName || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  emergencyContactName: e.target.value,
                })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Emergency Contact Phone
            </label>
            <input
              type="text"
              value={formData.emergencyContactPhone || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  emergencyContactPhone: e.target.value,
                })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Insurance Name
            </label>
            <input
              type="text"
              value={formData.insuranceName || ''}
              onChange={(e) =>
                setFormData({ ...formData, insuranceName: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '4px',
                fontWeight: '500',
              }}
            >
              Address
            </label>
            <input
              type="text"
              value={formData.addressText || ''}
              onChange={(e) =>
                setFormData({ ...formData, addressText: e.target.value })
              }
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>

          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              onClick={handleAutocomplete}
              style={{
                padding: '8px 16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
              }}
            >
              Autocompletar
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: loading ? '#ccc' : '#007bff',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
