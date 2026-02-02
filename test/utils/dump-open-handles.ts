type HandleInfo = {
  type: string;
  details?: Record<string, unknown>;
};

function summarizeHandle(handle: unknown): HandleInfo {
  let type: string = typeof handle;
  if (handle && typeof handle === 'object' && 'constructor' in handle) {
    const ctor = (handle as { constructor?: { name?: string } }).constructor;
    type = ctor?.name ?? 'Unknown';
  }

  const details: Record<string, unknown> = {};

  if (type === 'Timeout' || type === 'Immediate') {
    const h = handle as { _idleTimeout?: number; _repeat?: number };
    if (typeof h._idleTimeout === 'number') {
      details.idleTimeout = h._idleTimeout;
    }
    if (typeof h._repeat === 'number') details.repeat = h._repeat;
  }

  if (type === 'Socket' || type === 'TLSSocket') {
    const h = handle as {
      localAddress?: string;
      localPort?: number;
      remoteAddress?: string;
      remotePort?: number;
      _host?: string;
      _idleTimeout?: number;
    };
    if (h.localAddress) details.localAddress = h.localAddress;
    if (h.localPort) details.localPort = h.localPort;
    if (h.remoteAddress) details.remoteAddress = h.remoteAddress;
    if (h.remotePort) details.remotePort = h.remotePort;
    if (h._host) details.host = h._host;
    if (typeof h._idleTimeout === 'number') {
      details.idleTimeout = h._idleTimeout;
    }
  }

  if (type === 'Server') {
    const h = handle as { _connections?: number };
    if (typeof h._connections === 'number') {
      details.connections = h._connections;
    }
  }

  return Object.keys(details).length > 0 ? { type, details } : { type };
}

export function dumpOpenHandles() {
  const getHandles = (
    process as unknown as { _getActiveHandles?: () => unknown[] }
  )._getActiveHandles;
  const getRequests = (
    process as unknown as { _getActiveRequests?: () => unknown[] }
  )._getActiveRequests;

  const handles = getHandles ? getHandles() : [];
  const requests = getRequests ? getRequests() : [];

  const summarizedHandles = handles.map(summarizeHandle);
  const summarizedRequests = requests.map(summarizeHandle);

  console.log('[e2e] Active handles:', summarizedHandles);
  console.log('[e2e] Active requests:', summarizedRequests);
}
