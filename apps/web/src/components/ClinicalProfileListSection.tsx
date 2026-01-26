import type { ReactNode } from 'react';
import type {
  ClinicalProfileItem,
  ClinicalProfilePageInfo,
} from '../api/clinical-profile';
import { PaginationControls } from './PaginationControls';

type ClinicalProfileListSectionProps = {
  title: string;
  items: ClinicalProfileItem[];
  loading: boolean;
  error?: string | null;
  emptyText: string;
  pageInfo?: ClinicalProfilePageInfo | null;
  onPrev?: () => void;
  onNext?: () => void;
  headerAction?: ReactNode;
  headerContent?: ReactNode;
  renderItemActions?: (item: ClinicalProfileItem) => ReactNode;
  renderItemFooter?: (item: ClinicalProfileItem) => ReactNode;
  footerContent?: ReactNode;
};

const verificationLabels: Record<string, string> = {
  unverified: 'Sin verificar',
  verified: 'Verificado',
  disputed: 'Disputado',
};

const verificationColors: Record<
  string,
  { background: string; color: string }
> = {
  unverified: { background: '#f3f4f6', color: '#374151' },
  verified: { background: '#dcfce7', color: '#166534' },
  disputed: { background: '#fee2e2', color: '#991b1b' },
};

function Badge({ label, tone }: { label: string; tone?: string }) {
  const palette = tone ? verificationColors[tone] : undefined;
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        backgroundColor: palette?.background ?? '#e5e7eb',
        color: palette?.color ?? '#374151',
      }}
    >
      {label}
    </span>
  );
}

export function ClinicalProfileListSection({
  title,
  items,
  loading,
  error,
  emptyText,
  pageInfo,
  onPrev,
  onNext,
  headerAction,
  headerContent,
  renderItemActions,
  renderItemFooter,
  footerContent,
}: ClinicalProfileListSectionProps) {
  const totalCount = pageInfo?.total ?? items.length;
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: 'white',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {headerAction}
          <div style={{ fontSize: '12px', color: '#737373' }}>
            {loading ? '...' : `${totalCount}`}
          </div>
        </div>
      </div>

      {headerContent && (
        <div style={{ marginTop: '12px' }}>{headerContent}</div>
      )}

      {loading && (
        <div style={{ fontSize: '14px', marginTop: '12px' }}>Cargando...</div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c33',
            fontSize: '13px',
            marginTop: '12px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{ fontSize: '14px', color: '#737373', marginTop: '12px' }}>
          {emptyText}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {items.map((item) => {
            const verification = item.verificationStatus
              ? (verificationLabels[item.verificationStatus] ??
                item.verificationStatus)
              : null;
            return (
              <div
                key={item.id}
                style={{
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {item.name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
                    >
                      {verification && (
                        <Badge
                          label={verification}
                          tone={item.verificationStatus}
                        />
                      )}
                      {typeof item.isActive === 'boolean' && (
                        <Badge label={item.isActive ? 'Activo' : 'Inactivo'} />
                      )}
                    </div>
                    {renderItemActions && renderItemActions(item)}
                  </div>
                </div>
                {item.notes && (
                  <div style={{ fontSize: '13px', color: '#404040' }}>
                    {item.notes}
                  </div>
                )}
                {item.endedAt && !item.isActive && (
                  <div style={{ fontSize: '12px', color: '#737373' }}>
                    Finalizado: {new Date(item.endedAt).toLocaleDateString()}
                  </div>
                )}
                {renderItemFooter && renderItemFooter(item)}
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && pageInfo && onPrev && onNext && (
        <PaginationControls
          pageInfo={pageInfo}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
      {footerContent && (
        <div style={{ marginTop: '12px' }}>{footerContent}</div>
      )}
    </div>
  );
}
