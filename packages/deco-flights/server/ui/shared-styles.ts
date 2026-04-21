export const SHARED_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    background: var(--color-background-primary, #ffffff);
    color: var(--color-text-primary, #0f172a);
    line-height: 1.5;
    padding: 16px;
  }
  .muted { color: var(--color-text-secondary, #64748b); }
  .small { font-size: 12px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-draft { background: #f1f5f9; color: #475569; }
  .badge-researching { background: #dbeafe; color: #1d4ed8; }
  .badge-complete { background: #dcfce7; color: #16a34a; }
  .card {
    border: 1px solid var(--color-border-primary, #e2e8f0);
    border-radius: var(--border-radius-md, 8px);
    padding: 12px 16px;
    background: var(--color-background-primary, #ffffff);
  }
  .card:hover { background: var(--color-background-secondary, #f8fafc); }
  .grid { display: grid; gap: 12px; }
  .flex { display: flex; align-items: center; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  .justify-between { justify-content: space-between; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .text-lg { font-size: 18px; }
  .text-sm { font-size: 14px; }
  .text-xs { font-size: 12px; }
  .text-2xl { font-size: 24px; }
  .price { color: #16a34a; font-weight: 700; }
  .price-high { color: #dc2626; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .w-full { width: 100%; }
  .mt-2 { margin-top: 8px; }
  .mt-4 { margin-top: 16px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-4 { margin-bottom: 16px; }
  .p-3 { padding: 12px; }
  .p-4 { padding: 16px; }
  .rounded { border-radius: var(--border-radius-md, 8px); }
  .border { border: 1px solid var(--color-border-primary, #e2e8f0); }
  .bg-muted { background: var(--color-background-secondary, #f8fafc); }
  button {
    cursor: pointer;
    border: none;
    border-radius: var(--border-radius-md, 6px);
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.15s;
  }
  .btn-primary {
    background: #0f172a;
    color: white;
  }
  .btn-primary:hover { background: #1e293b; }
  .btn-ghost {
    background: transparent;
    color: var(--color-text-secondary, #64748b);
  }
  .btn-ghost:hover { background: var(--color-background-secondary, #f1f5f9); }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary, #64748b);
    border-bottom: 2px solid var(--color-border-primary, #e2e8f0);
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-border-primary, #e2e8f0);
    vertical-align: middle;
  }
  tr:hover td { background: var(--color-background-secondary, #f8fafc); }
  .arrow { color: var(--color-text-secondary, #94a3b8); margin: 0 4px; }
  .rank-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
  }
  .rank-1 { background: #fef3c7; color: #92400e; }
  .rank-2 { background: #e2e8f0; color: #475569; }
  .rank-3 { background: #fed7aa; color: #9a3412; }
  .rank-other { background: #f1f5f9; color: #64748b; }
  .score-bar {
    height: 4px;
    border-radius: 2px;
    background: #e2e8f0;
    overflow: hidden;
  }
  .score-fill {
    height: 100%;
    border-radius: 2px;
    background: #16a34a;
    transition: width 0.3s;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
  }
  .empty-state svg { margin-bottom: 16px; opacity: 0.4; }
`;

export const APPBRIDGE_SCRIPT = `
<script>
  // Minimal MCP App SDK — iframe sends ui/initialize to host, then listens for data
  var toolResult = null;
  var toolInput = null;
  var _rpcId = 1;
  var _pendingRequests = {};
  var _hostContext = null;

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;

    // JSON-RPC Request from host (has method + id) — respond to it
    if (msg.method && msg.id !== undefined) {
      // Host asks us to teardown
      if (msg.method === 'ui/resource-teardown') {
        window.parent.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
        return;
      }
      // Host calls a tool on us (we don't provide tools, just ack)
      window.parent.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
      return;
    }

    // JSON-RPC Notification from host (has method, no id)
    if (msg.method && msg.id === undefined) {
      if (msg.method === 'ui/notifications/tool-input') {
        toolInput = msg.params?.arguments || msg.params;
        if (typeof onToolInput === 'function') onToolInput(toolInput);
      }
      if (msg.method === 'ui/notifications/tool-result') {
        toolResult = msg.params;
        if (typeof onToolResult === 'function') onToolResult(toolResult);
      }
      if (msg.method === 'ui/notifications/host-context-changed') {
        _hostContext = Object.assign(_hostContext || {}, msg.params);
      }
      return;
    }

    // JSON-RPC Response to our request (has result or error, no method)
    if (msg.id !== undefined && !msg.method) {
      var cb = _pendingRequests[msg.id];
      if (cb) { delete _pendingRequests[msg.id]; cb(msg); }
    }
  });

  // Send a JSON-RPC request to host
  function rpcRequest(method, params, callback) {
    var id = _rpcId++;
    if (callback) _pendingRequests[id] = callback;
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params, id: id }, '*');
  }

  // Send a JSON-RPC notification to host (no id = no response expected)
  function rpcNotify(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params }, '*');
  }

  // Initiate handshake: App sends ui/initialize, host responds with context
  rpcRequest('ui/initialize', {
    appInfo: { name: 'deco-flights-ui', version: '0.1.0' },
    appCapabilities: {},
    protocolVersion: '2026-01-26'
  }, function(resp) {
    if (resp.result) {
      _hostContext = resp.result.hostContext;
    }
    // Tell host we're ready — this triggers tool-input and tool-result delivery
    rpcNotify('ui/notifications/initialized', {});
  });

  // Call a server tool via the host proxy
  function callServerTool(name, args, callback) {
    rpcRequest('tools/call', { name: name, arguments: args || {} }, function(resp) {
      if (callback) callback(resp.result || resp.error);
    });
  }

  // Send a message to chat
  function sendMessage(text) {
    rpcRequest('ui/message', {
      role: 'user',
      content: [{ type: 'text', text: text }]
    });
  }

  // Request height change
  function resizeHeight(h) {
    rpcNotify('ui/notifications/size-changed', { height: h, width: document.documentElement.scrollWidth });
  }
</script>
`;
