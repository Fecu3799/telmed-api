import { useState } from 'react';
import { PatientFilesPanel } from './PatientFilesPanel';

interface PatientFilesDrawerProps {
  /** Patient ID (required for doctor mode, optional for patient mode) */
  patientId?: string;
  /** Optional consultation ID to filter files */
  consultationId?: string;
}

export function PatientFilesDrawer({
  patientId,
  consultationId,
}: PatientFilesDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button - Fixed position (below chat button) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: '68px', // Below chat button (16px top + ~52px button height)
          right: isOpen ? '420px' : '16px',
          zIndex: 1000,
          padding: '12px 16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'right 0.3s ease',
        }}
      >
        {isOpen ? '← Hide Files' : 'Show Files →'}
      </button>

      {/* Drawer Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '400px',
            height: '100vh',
            backgroundColor: '#ffffff',
            borderLeft: '1px solid #e5e5e5',
            boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid #e5e5e5',
              backgroundColor: '#f5f5f5',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px' }}>
              Archivos del Paciente
            </h2>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              padding: '16px',
            }}
          >
            <PatientFilesPanel
              patientId={patientId}
              consultationId={consultationId}
              showUpload={true}
              showPatientSelector={false}
              compact={true}
            />
          </div>
        </div>
      )}
    </>
  );
}
