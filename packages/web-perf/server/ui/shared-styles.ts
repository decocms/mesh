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
  .badge-good { background: #dcfce7; color: #15803d; }
  .badge-needs-improvement { background: #fef3c7; color: #a16207; }
  .badge-poor { background: #fee2e2; color: #dc2626; }
  .card {
    border: 1px solid var(--color-border-primary, #e2e8f0);
    border-radius: var(--border-radius-md, 8px);
    padding: 12px 16px;
    background: var(--color-background-primary, #ffffff);
  }
  .card:hover { background: var(--color-background-secondary, #f8fafc); }
  .grid { display: grid; gap: 12px; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-5 { grid-template-columns: repeat(5, 1fr); }
  .flex { display: flex; align-items: center; }
  .flex-col { display: flex; flex-direction: column; }
  .gap-1 { gap: 4px; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  .justify-between { justify-content: space-between; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .text-lg { font-size: 18px; }
  .text-sm { font-size: 14px; }
  .text-xs { font-size: 12px; }
  .text-2xl { font-size: 24px; }
  .text-center { text-align: center; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .w-full { width: 100%; }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 8px; }
  .mt-3 { margin-top: 12px; }
  .mt-4 { margin-top: 16px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-3 { margin-bottom: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .p-3 { padding: 12px; }
  .p-4 { padding: 16px; }
  .rounded { border-radius: var(--border-radius-md, 8px); }
  .border { border: 1px solid var(--color-border-primary, #e2e8f0); }
  .bg-muted { background: var(--color-background-secondary, #f8fafc); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 8px 12px; font-weight: 600;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--color-text-secondary, #64748b);
    border-bottom: 2px solid var(--color-border-primary, #e2e8f0);
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-border-primary, #e2e8f0);
    vertical-align: middle;
  }
  tr:hover td { background: var(--color-background-secondary, #f8fafc); }
  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 48px 24px; text-align: center;
  }
  .empty-state svg { margin-bottom: 16px; opacity: 0.4; }
  .section-title {
    font-size: 14px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b);
    margin-bottom: 12px;
  }

  /* CWV-specific colors */
  .color-good { color: #0cce6b; }
  .color-needs-improvement { color: #ffa400; }
  .color-poor { color: #ff4e42; }
  .bg-good { background: #0cce6b; }
  .bg-needs-improvement { background: #ffa400; }
  .bg-poor { background: #ff4e42; }

  @media (max-width: 640px) {
    .grid-2, .grid-3, .grid-5 { grid-template-columns: 1fr; }
  }
`;

export const APPBRIDGE_SCRIPT = `
<script>
  var toolResult = null;
  var toolInput = null;
  var _rpcId = 1;
  var _pendingRequests = {};
  var _hostContext = null;

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;

    if (msg.method && msg.id !== undefined) {
      if (msg.method === 'ui/resource-teardown') {
        window.parent.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
        return;
      }
      window.parent.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
      return;
    }

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

    if (msg.id !== undefined && !msg.method) {
      var cb = _pendingRequests[msg.id];
      if (cb) { delete _pendingRequests[msg.id]; cb(msg); }
    }
  });

  function rpcRequest(method, params, callback) {
    var id = _rpcId++;
    if (callback) _pendingRequests[id] = callback;
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params, id: id }, '*');
  }

  function rpcNotify(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params }, '*');
  }

  rpcRequest('ui/initialize', {
    appInfo: { name: 'web-perf-ui', version: '0.1.0' },
    appCapabilities: {},
    protocolVersion: '2026-01-26'
  }, function(resp) {
    if (resp.result) _hostContext = resp.result.hostContext;
    rpcNotify('ui/notifications/initialized', {});
  });

  function callServerTool(name, args, callback) {
    rpcRequest('tools/call', { name: name, arguments: args || {} }, function(resp) {
      if (callback) callback(resp.result || resp.error);
    });
  }

  function sendMessage(text) {
    rpcRequest('ui/message', {
      role: 'user',
      content: [{ type: 'text', text: text }]
    });
  }

  function resizeHeight(h) {
    rpcNotify('ui/notifications/size-changed', { height: h, width: document.documentElement.scrollWidth });
  }
</script>
`;
