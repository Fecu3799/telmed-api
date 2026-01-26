type PaginationControlsProps = {
  pageInfo: {
    page: number;
    pageSize: number;
    total?: number;
    totalPages?: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  onPrev: () => void;
  onNext: () => void;
};

export function PaginationControls({
  pageInfo,
  onPrev,
  onNext,
}: PaginationControlsProps) {
  const totalPages =
    pageInfo.totalPages ?? Math.ceil((pageInfo.total ?? 0) / pageInfo.pageSize);

  if (!pageInfo.hasNextPage && !pageInfo.hasPrevPage && totalPages <= 1) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '16px',
      }}
    >
      <button
        onClick={onPrev}
        disabled={!pageInfo.hasPrevPage}
        style={{
          padding: '8px 16px',
          backgroundColor: pageInfo.hasPrevPage ? '#6c757d' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: pageInfo.hasPrevPage ? 'pointer' : 'not-allowed',
        }}
      >
        Anterior
      </button>

      <span style={{ color: '#666' }}>
        Página {pageInfo.page} de {Math.max(1, totalPages)}
      </span>

      <button
        onClick={onNext}
        disabled={!pageInfo.hasNextPage}
        style={{
          padding: '8px 16px',
          backgroundColor: pageInfo.hasNextPage ? '#007bff' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: pageInfo.hasNextPage ? 'pointer' : 'not-allowed',
        }}
      >
        Siguiente
      </button>
    </div>
  );
}
