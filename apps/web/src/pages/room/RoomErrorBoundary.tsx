import { Component, type ReactNode } from 'react';

interface RoomErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

interface RoomErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specifically for LiveKit room components.
 * Catches errors and shows a fallback UI instead of a blank screen.
 */
export class RoomErrorBoundary extends Component<
  RoomErrorBoundaryProps,
  RoomErrorBoundaryState
> {
  constructor(props: RoomErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RoomErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    if (import.meta.env.DEV) {
      console.error('[RoomErrorBoundary] Caught error:', error);
      console.error(
        '[RoomErrorBoundary] Component stack:',
        errorInfo.componentStack,
      );
    }

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '20px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
          }}
        >
          <h2 style={{ margin: '0 0 16px 0', color: '#ef4444' }}>
            Video Room Error
          </h2>
          <p style={{ margin: '0 0 8px 0', color: '#a3a3a3' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          {import.meta.env.DEV && this.state.error?.stack && (
            <pre
              style={{
                margin: '16px 0',
                padding: '12px',
                backgroundColor: '#2a2a2a',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxWidth: '800px',
                maxHeight: '300px',
              }}
            >
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
