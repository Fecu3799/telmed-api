import { useState, FormEvent } from 'react';
import { type ProblemDetails } from '../api/http';
import { type DoctorProfilePut, putDoctorProfile } from '../api/doctor-profile';

interface DoctorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DoctorProfileModal({ isOpen, onClose, onSuccess }: DoctorProfileModalProps) {
  const [formData, setFormData] = useState<DoctorProfilePut>({
    firstName: '',
    lastName: '',
    bio: '',
    priceCents: 120000,
    currency: 'ARS',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProblemDetails | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleAutocomplete = () => {
    setFormData({
      firstName: 'Dr',
      lastName: 'Demo',
      bio: 'Médico con experiencia en atención primaria',
      priceCents: 120000,
      currency: 'ARS',
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
      await putDoctorProfile(formData);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = err as { problemDetails?: ProblemDetails; status?: number; message?: string };
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
        <h2 style={{ marginTop: 0 }}>Doctor Profile</h2>

        {error && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c33' }}>
            {error.detail}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              First Name *
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {fieldErrors.firstName && (
              <div style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}>
                {fieldErrors.firstName.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              Last Name *
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {fieldErrors.lastName && (
              <div style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}>
                {fieldErrors.lastName.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              Bio
            </label>
            <textarea
              value={formData.bio || ''}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              Price (cents) *
            </label>
            <input
              type="number"
              value={formData.priceCents}
              onChange={(e) => setFormData({ ...formData, priceCents: parseInt(e.target.value) || 0 })}
              required
              min={0}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {fieldErrors.priceCents && (
              <div style={{ color: '#c33', fontSize: '14px', marginTop: '4px' }}>
                {fieldErrors.priceCents.join(', ')}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              Currency
            </label>
            <input
              type="text"
              value={formData.currency || 'ARS'}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleAutocomplete}
              style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
            >
              Autocompletar
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '8px 16px', border: 'none', borderRadius: '4px', backgroundColor: loading ? '#ccc' : '#007bff', color: 'white', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

