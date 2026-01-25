/**
 * UI Widget Resources
 *
 * HTML content for all UI widgets (MCP Apps).
 * These are served via the management MCP's resources/read method.
 */

// Design tokens matching Mesh's aesthetic
const tokens = {
  bg: "#ffffff",
  bgSubtle: "#f9fafb",
  border: "#e5e7eb",
  text: "#111827",
  textMuted: "#6b7280",
  textSubtle: "#9ca3af",
  primary: "#6366f1",
  success: "#10b981",
  destructive: "#ef4444",
  warning: "#f59e0b",
};

/**
 * Base CSS shared by all widgets
 */
const baseCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; width: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: ${tokens.bg};
    color: ${tokens.text};
  }
`;

/**
 * UI Widget resource definition
 */
interface UIWidgetResource {
  name: string;
  description: string;
  html: string;
  exampleInput: Record<string, unknown>;
}

/**
 * UI Widget resources
 */
export const UI_WIDGET_RESOURCES: Record<string, UIWidgetResource> = {
  "ui://mesh/counter": {
    name: "Counter",
    description: "Interactive counter with increment/decrement controls",
    exampleInput: { initialValue: 42, label: "Page Views" },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; gap: 16px; }
    .value-section { display: flex; align-items: baseline; gap: 8px; }
    .value { font-size: 36px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${tokens.primary}; }
    .label { font-size: 13px; color: ${tokens.textMuted}; }
    .controls { display: flex; gap: 8px; }
    button { width: 36px; height: 36px; border: 1px solid ${tokens.border}; border-radius: 8px; background: ${tokens.bg}; font-size: 18px; color: ${tokens.textMuted}; cursor: pointer; transition: all 0.15s; }
    button:hover { background: ${tokens.bgSubtle}; color: ${tokens.text}; }
    button:active { transform: scale(0.95); }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; padding: 32px; gap: 24px; }
      .value-section { flex-direction: column; align-items: center; gap: 4px; }
      .value { font-size: 72px; }
      .label { font-size: 14px; order: -1; }
      button { width: 48px; height: 48px; font-size: 24px; border-radius: 12px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="value-section">
      <span class="label" id="label">Counter</span>
      <span class="value" id="value">0</span>
    </div>
    <div class="controls">
      <button onclick="update(-1)">−</button>
      <button onclick="update(1)">+</button>
    </div>
  </div>
  <script>
    let count = 0;
    function update(delta) { count += delta; document.getElementById('value').textContent = count; }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.initialValue !== undefined) { count = input.initialValue; document.getElementById('value').textContent = count; }
        if (input.label) document.getElementById('label').textContent = input.label;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/metric": {
    name: "Metric Card",
    description:
      "Beautiful metric card with value, trend badge, and description",
    exampleInput: {
      label: "Total Revenue",
      value: "$1,250.00",
      trend: 12.5,
      trendLabel: "Trending up this month",
      description: "Revenue for the last 6 months",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .card { height: 100%; display: flex; flex-direction: column; padding: 20px; gap: 8px; }
    .header { display: flex; align-items: center; justify-content: space-between; }
    .label { font-size: 13px; font-weight: 500; color: ${tokens.textMuted}; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; }
    .badge.up { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
    .badge.down { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .badge svg { width: 12px; height: 12px; }
    .value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .trend-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${tokens.text}; }
    .trend-label svg { width: 14px; height: 14px; color: ${tokens.textMuted}; }
    .description { font-size: 12px; color: ${tokens.textMuted}; }
    @media (min-height: 450px) {
      .card { padding: 24px; gap: 12px; }
      .value { font-size: 36px; }
      .label { font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="label" id="label">Metric</span>
      <span class="badge" id="badge" style="display: none;">
        <svg id="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l5-5 5 5M7 7l5 5 5-5"/></svg>
        <span id="badge-value">0%</span>
      </span>
    </div>
    <div class="value" id="value">0</div>
    <div class="trend-label" id="trend-label" style="display: none;">
      <svg id="trend-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l5-5 5 5"/></svg>
      <span id="trend-text"></span>
    </div>
    <div class="description" id="description"></div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value !== undefined) document.getElementById('value').textContent = input.value;
        if (input.trend !== undefined) {
          const badge = document.getElementById('badge');
          const up = input.trend >= 0;
          badge.className = 'badge ' + (up ? 'up' : 'down');
          badge.style.display = 'inline-flex';
          document.getElementById('badge-icon').innerHTML = up 
            ? '<path d="M18 15l-6-6-6 6"/>' 
            : '<path d="M6 9l6 6 6-6"/>';
          document.getElementById('badge-value').textContent = (up ? '+' : '') + input.trend + '%';
        }
        if (input.trendLabel) {
          const trendEl = document.getElementById('trend-label');
          trendEl.style.display = 'flex';
          document.getElementById('trend-text').textContent = input.trendLabel;
          const up = input.trend >= 0;
          document.getElementById('trend-icon').innerHTML = up 
            ? '<path d="M18 15l-6-6-6 6"/>' 
            : '<path d="M6 9l6 6 6-6"/>';
        }
        if (input.description) document.getElementById('description').textContent = input.description;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/progress": {
    name: "Progress Tracker",
    description: "Visual progress bar with percentage and label",
    exampleInput: { label: "Upload Progress", value: 67, total: 100 },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 16px; }
    .info { display: flex; align-items: baseline; gap: 8px; min-width: 120px; }
    .label { font-size: 13px; color: ${tokens.textMuted}; }
    .percent { font-size: 24px; font-weight: 600; color: ${tokens.primary}; }
    .bar-container { flex: 1; height: 8px; background: ${tokens.bgSubtle}; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: ${tokens.primary}; border-radius: 4px; transition: width 0.3s ease; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; gap: 20px; }
      .bar-container { width: 100%; max-width: 300px; height: 12px; border-radius: 6px; }
      .percent { font-size: 36px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="info">
      <span class="label" id="label">Progress</span>
      <span class="percent" id="percent">0%</span>
    </div>
    <div class="bar-container"><div class="bar" id="bar" style="width: 0%"></div></div>
  </div>
  <script>
    function setProgress(value, total = 100) {
      const pct = Math.round((value / total) * 100);
      document.getElementById('percent').textContent = pct + '%';
      document.getElementById('bar').style.width = pct + '%';
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value !== undefined) setProgress(input.value, input.total || 100);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/greeting": {
    name: "Greeting Card",
    description: "Animated personalized greeting",
    exampleInput: { name: "World", message: "Welcome to MCP Apps!" },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 12px; }
    .emoji { font-size: 32px; }
    .content { flex: 1; }
    .name { font-size: 18px; font-weight: 600; color: ${tokens.primary}; }
    .message { font-size: 14px; color: ${tokens.textMuted}; margin-top: 2px; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; text-align: center; gap: 16px; }
      .emoji { font-size: 48px; }
      .name { font-size: 24px; }
      .message { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="emoji">👋</span>
    <div class="content">
      <div class="name" id="name">Hello!</div>
      <div class="message" id="message"></div>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.name) document.getElementById('name').textContent = 'Hello, ' + input.name + '!';
        if (input.message) document.getElementById('message').textContent = input.message;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/chart": {
    name: "Bar Chart",
    description: "Animated bar chart visualization",
    exampleInput: {
      title: "Weekly Sales",
      data: [
        { label: "Mon", value: 42 },
        { label: "Tue", value: 58 },
        { label: "Wed", value: 35 },
        { label: "Thu", value: 72 },
        { label: "Fri", value: 89 },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; padding: 16px; }
    h2 { font-size: 14px; font-weight: 500; color: ${tokens.text}; margin-bottom: 12px; }
    .chart-container { flex: 1; display: flex; overflow: hidden; }
    .chart { display: flex; align-items: flex-end; justify-content: space-around; height: 100%; width: 100%; gap: 8px; padding-bottom: 24px; }
    .bar-wrap { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; max-width: 60px; height: 100%; position: relative; }
    .value { font-size: 11px; color: ${tokens.textMuted}; margin-bottom: 4px; }
    .bar { width: 100%; background: ${tokens.primary}; border-radius: 4px 4px 0 0; transition: height 0.5s ease; }
    .label { position: absolute; bottom: -20px; font-size: 10px; color: ${tokens.textSubtle}; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <h2 id="title">Chart</h2>
    <div class="chart-container"><div class="chart" id="chart"></div></div>
  </div>
  <script>
    function render(data) {
      const chart = document.getElementById('chart');
      chart.innerHTML = '';
      if (!data?.length) return;
      const max = Math.max(...data.map(d => d.value));
      data.forEach((d, i) => {
        const wrap = document.createElement('div'); wrap.className = 'bar-wrap';
        const value = document.createElement('div'); value.className = 'value'; value.textContent = d.value;
        const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = '0';
        setTimeout(() => { bar.style.height = (d.value / max * 100) + '%'; }, i * 60);
        const label = document.createElement('div'); label.className = 'label'; label.textContent = d.label;
        wrap.append(value, bar, label); chart.appendChild(wrap);
      });
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.data) render(input.data);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/timer": {
    name: "Timer",
    description: "Countdown timer with start/pause controls",
    exampleInput: { seconds: 300, label: "5 Minute Timer" },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; gap: 16px; }
    .time { font-size: 32px; font-weight: 600; font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
    .time.done { color: ${tokens.primary}; }
    .controls { display: flex; gap: 8px; }
    button { padding: 8px 16px; border: 1px solid ${tokens.border}; border-radius: 8px; background: ${tokens.bg}; font-size: 13px; color: ${tokens.textMuted}; cursor: pointer; transition: all 0.15s; }
    button:hover { background: ${tokens.bgSubtle}; color: ${tokens.text}; }
    button.primary { background: ${tokens.primary}; color: white; border-color: ${tokens.primary}; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; gap: 20px; }
      .time { font-size: 56px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="time" id="time">00:00</span>
    <div class="controls">
      <button id="toggle" class="primary" onclick="toggle()">Start</button>
      <button onclick="reset()">Reset</button>
    </div>
  </div>
  <script>
    let seconds = 0, initialSeconds = 0, running = false, interval = null;
    const timeEl = document.getElementById('time');
    function format(s) { const m = Math.floor(s / 60), sec = s % 60; return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'); }
    function update() { timeEl.textContent = format(seconds); timeEl.classList.toggle('done', seconds === 0 && initialSeconds > 0); }
    function toggle() {
      if (seconds <= 0 && !running) return;
      running = !running;
      document.getElementById('toggle').textContent = running ? 'Pause' : 'Start';
      if (running) {
        interval = setInterval(() => {
          if (seconds > 0) { seconds--; update(); }
          if (seconds <= 0) { clearInterval(interval); running = false; document.getElementById('toggle').textContent = 'Start'; }
        }, 1000);
      } else { clearInterval(interval); }
    }
    function reset() { seconds = initialSeconds; running = false; clearInterval(interval); document.getElementById('toggle').textContent = 'Start'; update(); }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.seconds) { seconds = input.seconds; initialSeconds = input.seconds; update(); }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/status": {
    name: "Status Badge",
    description: "Status indicator with icon and label",
    exampleInput: {
      status: "System Operational",
      description: "All services running normally",
      type: "success",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 12px; }
    .indicator { width: 10px; height: 10px; border-radius: 50%; background: ${tokens.success}; flex-shrink: 0; }
    .indicator.warning { background: ${tokens.warning}; }
    .indicator.error { background: ${tokens.destructive}; }
    .indicator.info { background: ${tokens.primary}; }
    .content { flex: 1; }
    .status { font-size: 15px; font-weight: 500; }
    .description { font-size: 12px; color: ${tokens.textMuted}; display: none; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; text-align: center; gap: 16px; }
      .indicator { width: 16px; height: 16px; }
      .status { font-size: 20px; }
      .description { display: block; margin-top: 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="indicator" id="indicator"></div>
    <div class="content">
      <div class="status" id="status">Status</div>
      <div class="description" id="description"></div>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.status) document.getElementById('status').textContent = input.status;
        if (input.description) document.getElementById('description').textContent = input.description;
        if (input.type) document.getElementById('indicator').className = 'indicator ' + input.type;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/quote": {
    name: "Quote",
    description: "Display a quote or text with attribution",
    exampleInput: {
      text: "The best way to predict the future is to invent it.",
      author: "Alan Kay",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 12px; }
    .quote-mark { font-size: 32px; color: ${tokens.primary}; opacity: 0.5; line-height: 1; }
    .content { flex: 1; }
    .text { font-size: 14px; font-style: italic; line-height: 1.5; }
    .author { font-size: 12px; color: ${tokens.textMuted}; margin-top: 4px; }
    .author::before { content: '— '; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; text-align: center; gap: 16px; }
      .quote-mark { font-size: 48px; }
      .text { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="quote-mark">"</div>
    <div class="content">
      <div class="text" id="text">Quote text here</div>
      <div class="author" id="author"></div>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.text) document.getElementById('text').textContent = input.text;
        if (input.author) document.getElementById('author').textContent = input.author;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/sparkline": {
    name: "Sparkline",
    description: "Compact inline trend chart",
    exampleInput: {
      label: "Revenue",
      value: "$12.4k",
      data: [25, 42, 38, 56, 48, 62, 55, 71, 68, 82],
      trend: 18,
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 16px; }
    .info { display: flex; align-items: baseline; gap: 8px; }
    .value { font-size: 24px; font-weight: 600; }
    .label { font-size: 12px; color: ${tokens.textMuted}; }
    .chart { flex: 1; height: 40px; display: flex; align-items: flex-end; gap: 2px; }
    .bar { flex: 1; background: ${tokens.primary}; border-radius: 2px; }
    .trend { font-size: 12px; color: ${tokens.success}; }
    .trend.down { color: ${tokens.destructive}; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; gap: 20px; }
      .value { font-size: 36px; }
      .chart { height: 80px; width: 100%; max-width: 280px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="info">
      <span class="label" id="label">Value</span>
      <span class="value" id="value">0</span>
    </div>
    <div class="chart" id="chart"></div>
    <span class="trend" id="trend"></span>
  </div>
  <script>
    function render(data) {
      const chart = document.getElementById('chart');
      chart.innerHTML = '';
      if (!data?.length) return;
      const max = Math.max(...data);
      data.forEach(v => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = (v / max * 100) + '%';
        chart.appendChild(bar);
      });
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.value) document.getElementById('value').textContent = input.value;
        if (input.data) render(input.data);
        if (input.trend !== undefined) {
          const el = document.getElementById('trend');
          const up = input.trend >= 0;
          el.className = 'trend' + (up ? '' : ' down');
          el.textContent = (up ? '↑' : '↓') + ' ' + Math.abs(input.trend) + '%';
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/code": {
    name: "Code Snippet",
    description: "Syntax-highlighted code display",
    exampleInput: {
      code: "function greet(name) {\n  return `Hello, ${name}!`;\n}",
      language: "javascript",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; padding: 12px; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .language { font-size: 11px; color: ${tokens.textMuted}; background: ${tokens.bgSubtle}; padding: 2px 8px; border-radius: 4px; }
    .copy { font-size: 11px; color: ${tokens.primary}; background: none; border: none; cursor: pointer; }
    pre { flex: 1; overflow: auto; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="language" id="language">javascript</span>
      <button class="copy" onclick="copyCode()">Copy</button>
    </div>
    <pre id="code">// Code here</pre>
  </div>
  <script>
    function copyCode() { navigator.clipboard.writeText(document.getElementById('code').textContent); }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.code) document.getElementById('code').textContent = input.code;
        if (input.language) document.getElementById('language').textContent = input.language;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/confirmation": {
    name: "Confirmation",
    description: "Confirmation dialog with accept/cancel",
    exampleInput: {
      title: "Delete Item?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 16px; text-align: center; }
    .title { font-size: 18px; font-weight: 600; }
    .message { font-size: 14px; color: ${tokens.textMuted}; }
    .buttons { display: flex; gap: 12px; margin-top: 8px; }
    button { padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; transition: all 0.15s; }
    .cancel { background: ${tokens.bg}; border: 1px solid ${tokens.border}; color: ${tokens.textMuted}; }
    .confirm { background: ${tokens.primary}; border: none; color: white; }
    .confirm.destructive { background: ${tokens.destructive}; }
    button:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="title">Confirm</div>
    <div class="message" id="message">Are you sure?</div>
    <div class="buttons">
      <button class="cancel" id="cancel">Cancel</button>
      <button class="confirm" id="confirm">Confirm</button>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.message) document.getElementById('message').textContent = input.message;
        if (input.confirmLabel) document.getElementById('confirm').textContent = input.confirmLabel;
        if (input.cancelLabel) document.getElementById('cancel').textContent = input.cancelLabel;
        if (input.variant === 'destructive') document.getElementById('confirm').classList.add('destructive');
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/json-viewer": {
    name: "JSON Viewer",
    description: "JSON tree viewer with collapse/expand",
    exampleInput: {
      title: "API Response",
      data: {
        user: { id: 1, name: "Alice", email: "alice@example.com" },
        status: "active",
      },
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 12px; overflow: auto; }
    .title { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
    pre { font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.5; background: ${tokens.bgSubtle}; padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="title"></div>
    <pre id="json">{}</pre>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.data) document.getElementById('json').textContent = JSON.stringify(input.data, null, 2);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/table": {
    name: "Table",
    description: "Data table with hover states and modern styling",
    exampleInput: {
      title: "Team Members",
      columns: [
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
      ],
      rows: [
        { name: "Alice Johnson", role: "Engineer", status: "Active" },
        { name: "Bob Smith", role: "Designer", status: "Active" },
        { name: "Charlie Brown", role: "Product Manager", status: "Away" },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .title { font-size: 16px; font-weight: 600; }
    .count { font-size: 12px; color: ${tokens.textMuted}; background: ${tokens.bgSubtle}; padding: 2px 8px; border-radius: 9999px; }
    .table-wrap { border: 1px solid ${tokens.border}; border-radius: 8px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 12px 16px; background: ${tokens.bgSubtle}; font-weight: 500; font-size: 12px; color: ${tokens.textMuted}; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid ${tokens.border}; }
    td { padding: 12px 16px; border-bottom: 1px solid ${tokens.border}; transition: background 0.15s; }
    tbody tr:hover td { background: ${tokens.bgSubtle}; }
    tbody tr:last-child td { border-bottom: none; }
    .status { display: inline-flex; align-items: center; gap: 6px; }
    .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: ${tokens.success}; }
    .status.away::before { background: ${tokens.warning}; }
    .status.offline::before { background: ${tokens.textMuted}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="title" id="title"></span>
      <span class="count" id="count"></span>
    </div>
    <div class="table-wrap">
      <table id="table"><thead id="thead"></thead><tbody id="tbody"></tbody></table>
    </div>
  </div>
  <script>
    function render(columns, rows) {
      const thead = document.getElementById('thead');
      const tbody = document.getElementById('tbody');
      document.getElementById('count').textContent = rows.length + ' items';
      thead.innerHTML = '<tr>' + columns.map(c => '<th>' + c.label + '</th>').join('') + '</tr>';
      tbody.innerHTML = rows.map(r => '<tr>' + columns.map(c => {
        const val = r[c.key] ?? '';
        if (c.key === 'status') {
          const cls = val.toLowerCase().includes('away') ? 'away' : val.toLowerCase().includes('offline') ? 'offline' : '';
          return '<td><span class="status ' + cls + '">' + val + '</span></td>';
        }
        return '<td>' + val + '</td>';
      }).join('') + '</tr>').join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.columns && input.rows) render(input.columns, input.rows);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/diff": {
    name: "Diff",
    description: "Text diff viewer",
    exampleInput: {
      title: "Config Change",
      before: "debug: false\nport: 3000",
      after: "debug: true\nport: 8080\nhost: localhost",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 12px; overflow: auto; }
    .title { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
    .diff { font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.6; }
    .line { padding: 2px 8px; }
    .add { background: rgba(16, 185, 129, 0.1); color: ${tokens.success}; }
    .del { background: rgba(239, 68, 68, 0.1); color: ${tokens.destructive}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="title">Diff</div>
    <div class="diff" id="diff"></div>
  </div>
  <script>
    function renderDiff(before, after) {
      const diff = document.getElementById('diff');
      const beforeLines = before.split('\\n');
      const afterLines = after.split('\\n');
      let html = '';
      beforeLines.forEach(l => html += '<div class="line del">- ' + l + '</div>');
      afterLines.forEach(l => html += '<div class="line add">+ ' + l + '</div>');
      diff.innerHTML = html;
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.before && input.after) renderDiff(input.before, input.after);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/todo": {
    name: "Todo",
    description: "Interactive todo list",
    exampleInput: {
      title: "Today's Tasks",
      items: [
        { id: "1", text: "Review pull request", completed: true },
        { id: "2", text: "Update documentation", completed: false },
        { id: "3", text: "Deploy to staging", completed: false },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; }
    .title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid ${tokens.border}; }
    .item:last-child { border-bottom: none; }
    input[type="checkbox"] { width: 18px; height: 18px; accent-color: ${tokens.primary}; }
    .text { font-size: 14px; }
    .text.done { text-decoration: line-through; color: ${tokens.textMuted}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="title">Tasks</div>
    <div id="list"></div>
  </div>
  <script>
    function render(items) {
      const list = document.getElementById('list');
      list.innerHTML = items.map(i => '<div class="item"><input type="checkbox" ' + (i.completed ? 'checked' : '') + '><span class="text ' + (i.completed ? 'done' : '') + '">' + i.text + '</span></div>').join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.items) render(input.items);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/markdown": {
    name: "Markdown",
    description: "Rendered markdown content",
    exampleInput: {
      title: "Getting Started",
      content:
        "# Welcome\n\nThis is a **markdown** widget.\n\nUse it to display rich text content.",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; }
    .title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .content { font-size: 14px; line-height: 1.6; }
    .content h1 { font-size: 24px; font-weight: 600; margin: 16px 0 8px; }
    .content h2 { font-size: 20px; font-weight: 600; margin: 14px 0 6px; }
    .content p { margin: 8px 0; }
    .content code { background: ${tokens.bgSubtle}; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="title" id="title"></div>
    <div class="content" id="content"></div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.content) document.getElementById('content').innerHTML = input.content.replace(/\\n/g, '<br>');
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/image": {
    name: "Image",
    description: "Image display with caption",
    exampleInput: {
      src: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop",
      alt: "Mountain landscape",
      caption: "Beautiful mountain vista at sunset",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    img { max-width: 100%; max-height: 80%; object-fit: contain; border-radius: 8px; }
    .caption { margin-top: 12px; font-size: 13px; color: ${tokens.textMuted}; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <img id="img" src="" alt="">
    <div class="caption" id="caption"></div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.src) document.getElementById('img').src = input.src;
        if (input.alt) document.getElementById('img').alt = input.alt;
        if (input.caption) document.getElementById('caption').textContent = input.caption;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/form-result": {
    name: "Form Result",
    description: "Form submission result display",
    exampleInput: {
      title: "Registration Complete",
      status: "success",
      fields: [
        { label: "Name", value: "Alice Johnson" },
        { label: "Email", value: "alice@example.com" },
        { label: "Plan", value: "Pro" },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; }
    .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .icon.success { background: rgba(16, 185, 129, 0.1); color: ${tokens.success}; }
    .icon.error { background: rgba(239, 68, 68, 0.1); color: ${tokens.destructive}; }
    .title { font-size: 16px; font-weight: 600; }
    .field { display: flex; padding: 8px 0; border-bottom: 1px solid ${tokens.border}; }
    .field:last-child { border-bottom: none; }
    .label { font-size: 13px; color: ${tokens.textMuted}; width: 120px; flex-shrink: 0; }
    .value { font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="icon success" id="icon">✓</div>
      <div class="title" id="title">Form Submitted</div>
    </div>
    <div id="fields"></div>
  </div>
  <script>
    function render(fields, status) {
      const icon = document.getElementById('icon');
      icon.className = 'icon ' + status;
      icon.textContent = status === 'success' ? '✓' : status === 'error' ? '✗' : '…';
      document.getElementById('fields').innerHTML = fields.map(f => '<div class="field"><span class="label">' + f.label + '</span><span class="value">' + f.value + '</span></div>').join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.fields) render(input.fields, input.status || 'success');
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/error": {
    name: "Error",
    description: "Error display with details",
    exampleInput: {
      title: "Connection Failed",
      message: "Unable to connect to the database server.",
      code: "ERR_CONN_REFUSED",
      details: "Check that the database server is running and accessible.",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; background: rgba(239, 68, 68, 0.05); }
    .header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .icon { color: ${tokens.destructive}; font-size: 20px; }
    .title { font-size: 16px; font-weight: 600; color: ${tokens.destructive}; }
    .message { font-size: 14px; margin-bottom: 12px; }
    .code { font-size: 12px; color: ${tokens.textMuted}; margin-bottom: 8px; }
    .details { font-size: 12px; color: ${tokens.textMuted}; padding: 12px; background: ${tokens.bgSubtle}; border-radius: 8px; font-family: ui-monospace, monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="icon">⚠</span>
      <div class="title" id="title">Error</div>
    </div>
    <div class="message" id="message"></div>
    <div class="code" id="code"></div>
    <div class="details" id="details"></div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.message) document.getElementById('message').textContent = input.message;
        if (input.code) document.getElementById('code').textContent = 'Code: ' + input.code;
        if (input.details || input.stack) document.getElementById('details').textContent = input.details || input.stack;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/notification": {
    name: "Notification",
    description: "Notification banner",
    exampleInput: {
      title: "Update Available",
      message: "A new version is ready to install.",
      type: "info",
      action: "Install Now",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 12px; }
    .icon { font-size: 20px; }
    .content { flex: 1; }
    .title { font-size: 14px; font-weight: 500; }
    .message { font-size: 13px; color: ${tokens.textMuted}; margin-top: 2px; }
    .action { padding: 6px 12px; border: 1px solid ${tokens.border}; border-radius: 6px; font-size: 12px; background: ${tokens.bg}; cursor: pointer; }
    .container.info { border-left: 3px solid ${tokens.primary}; }
    .container.success { border-left: 3px solid ${tokens.success}; }
    .container.warning { border-left: 3px solid ${tokens.warning}; }
    .container.error { border-left: 3px solid ${tokens.destructive}; }
  </style>
</head>
<body>
  <div class="container info" id="container">
    <span class="icon" id="icon">ℹ</span>
    <div class="content">
      <div class="title" id="title">Notification</div>
      <div class="message" id="message"></div>
    </div>
    <button class="action" id="action" style="display:none">Action</button>
  </div>
  <script>
    const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const type = input.type || 'info';
        document.getElementById('container').className = 'container ' + type;
        document.getElementById('icon').textContent = icons[type] || 'ℹ';
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.message) document.getElementById('message').textContent = input.message;
        if (input.action) {
          const btn = document.getElementById('action');
          btn.textContent = input.action;
          btn.style.display = 'block';
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/avatar": {
    name: "Avatar",
    description:
      "User avatar with image, fallback initials, and optional status",
    exampleInput: {
      name: "Alice Johnson",
      src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice",
      status: "online",
      size: "lg",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; gap: 12px; }
    .avatar { position: relative; display: inline-flex; }
    .avatar-img { border-radius: 9999px; background: ${tokens.bgSubtle}; object-fit: cover; }
    .avatar-fallback { display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: ${tokens.primary}; color: white; font-weight: 500; text-transform: uppercase; }
    .sm .avatar-img, .sm .avatar-fallback { width: 32px; height: 32px; font-size: 12px; }
    .md .avatar-img, .md .avatar-fallback { width: 40px; height: 40px; font-size: 14px; }
    .lg .avatar-img, .lg .avatar-fallback { width: 56px; height: 56px; font-size: 18px; }
    .xl .avatar-img, .xl .avatar-fallback { width: 80px; height: 80px; font-size: 24px; }
    .status { position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 9999px; border: 2px solid white; }
    .status.online { background: ${tokens.success}; }
    .status.offline { background: ${tokens.textMuted}; }
    .status.busy { background: ${tokens.destructive}; }
    .status.away { background: ${tokens.warning}; }
    .info { display: flex; flex-direction: column; }
    .name { font-size: 14px; font-weight: 500; }
    .role { font-size: 12px; color: ${tokens.textMuted}; }
    @media (min-height: 450px) {
      .container { flex-direction: column; gap: 16px; }
      .info { align-items: center; }
      .name { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="avatar lg" id="avatar">
      <img class="avatar-img" id="img" src="" style="display:none">
      <div class="avatar-fallback" id="fallback">?</div>
      <span class="status" id="status" style="display:none"></span>
    </div>
    <div class="info" id="info" style="display:none">
      <span class="name" id="name"></span>
      <span class="role" id="role"></span>
    </div>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        const avatar = document.getElementById('avatar');
        if (input.size) avatar.className = 'avatar ' + input.size;
        if (input.src) {
          const img = document.getElementById('img');
          img.src = input.src;
          img.style.display = 'block';
          document.getElementById('fallback').style.display = 'none';
          img.onerror = () => { img.style.display = 'none'; document.getElementById('fallback').style.display = 'flex'; };
        }
        if (input.name) {
          const initials = input.name.split(' ').map(n => n[0]).slice(0, 2).join('');
          document.getElementById('fallback').textContent = initials;
          document.getElementById('name').textContent = input.name;
          document.getElementById('info').style.display = 'flex';
        }
        if (input.role) document.getElementById('role').textContent = input.role;
        if (input.status) {
          const status = document.getElementById('status');
          status.className = 'status ' + input.status;
          status.style.display = 'block';
        }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/switch": {
    name: "Switch",
    description: "Toggle switch with label",
    exampleInput: {
      label: "Dark Mode",
      description: "Enable dark mode for the application",
      checked: true,
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; }
    .content { flex: 1; }
    .label { font-size: 14px; font-weight: 500; }
    .description { font-size: 12px; color: ${tokens.textMuted}; margin-top: 2px; }
    .switch { position: relative; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; inset: 0; background: ${tokens.border}; border-radius: 9999px; transition: all 0.2s; }
    .slider::before { content: ''; position: absolute; width: 20px; height: 20px; left: 2px; top: 2px; background: white; border-radius: 9999px; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    input:checked + .slider { background: ${tokens.primary}; }
    input:checked + .slider::before { transform: translateX(20px); }
    input:focus-visible + .slider { outline: 2px solid ${tokens.primary}; outline-offset: 2px; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; gap: 16px; text-align: center; }
      .switch { width: 52px; height: 28px; }
      .slider::before { width: 24px; height: 24px; }
      input:checked + .slider::before { transform: translateX(24px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <div class="label" id="label">Toggle</div>
      <div class="description" id="description"></div>
    </div>
    <label class="switch">
      <input type="checkbox" id="switch">
      <span class="slider"></span>
    </label>
  </div>
  <script>
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.description) document.getElementById('description').textContent = input.description;
        if (input.checked) document.getElementById('switch').checked = true;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/slider": {
    name: "Slider",
    description: "Range slider with value display",
    exampleInput: {
      label: "Volume",
      value: 75,
      min: 0,
      max: 100,
      step: 1,
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; padding: 16px 20px; gap: 16px; }
    .label { font-size: 13px; color: ${tokens.textMuted}; min-width: 60px; }
    .slider-wrap { flex: 1; display: flex; align-items: center; gap: 12px; }
    input[type="range"] { flex: 1; height: 6px; appearance: none; background: ${tokens.bgSubtle}; border-radius: 3px; cursor: pointer; }
    input[type="range"]::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 9999px; background: ${tokens.primary}; border: none; box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: pointer; transition: transform 0.15s; }
    input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.1); }
    input[type="range"]::-webkit-slider-thumb:active { transform: scale(0.95); }
    .value { font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; }
    @media (min-height: 450px) {
      .container { flex-direction: column; justify-content: center; gap: 20px; }
      .slider-wrap { width: 100%; max-width: 280px; }
      .value { font-size: 32px; min-width: auto; }
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="label" id="label">Value</span>
    <div class="slider-wrap">
      <input type="range" id="slider" min="0" max="100" value="50">
      <span class="value" id="value">50</span>
    </div>
  </div>
  <script>
    const slider = document.getElementById('slider');
    const valueEl = document.getElementById('value');
    slider.oninput = () => valueEl.textContent = slider.value;
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.label) document.getElementById('label').textContent = input.label;
        if (input.min !== undefined) slider.min = input.min;
        if (input.max !== undefined) slider.max = input.max;
        if (input.step !== undefined) slider.step = input.step;
        if (input.value !== undefined) { slider.value = input.value; valueEl.textContent = input.value; }
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/rating": {
    name: "Rating",
    description: "Star rating display",
    exampleInput: {
      rating: 4.5,
      max: 5,
      reviews: 128,
      label: "Customer Rating",
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px 20px; gap: 12px; }
    .stars { display: flex; gap: 2px; }
    .star { width: 20px; height: 20px; color: ${tokens.warning}; }
    .star.empty { color: ${tokens.border}; }
    .star.half { position: relative; }
    .star.half::after { content: ''; position: absolute; left: 0; top: 0; width: 50%; height: 100%; overflow: hidden; }
    .info { display: flex; flex-direction: column; gap: 2px; }
    .rating { font-size: 18px; font-weight: 600; }
    .reviews { font-size: 12px; color: ${tokens.textMuted}; }
    .label { font-size: 11px; color: ${tokens.textSubtle}; }
    @media (min-height: 450px) {
      .container { flex-direction: column; gap: 16px; }
      .stars { gap: 4px; }
      .star { width: 28px; height: 28px; }
      .rating { font-size: 24px; }
      .info { align-items: center; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="stars" id="stars"></div>
    <div class="info">
      <span class="rating" id="rating">0</span>
      <span class="reviews" id="reviews"></span>
      <span class="label" id="label"></span>
    </div>
  </div>
  <script>
    function renderStars(rating, max = 5) {
      const stars = document.getElementById('stars');
      stars.innerHTML = '';
      for (let i = 1; i <= max; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        star.setAttribute('viewBox', '0 0 24 24');
        star.setAttribute('fill', 'currentColor');
        star.classList.add('star');
        if (i <= rating) {
          star.innerHTML = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
        } else if (i - 0.5 <= rating) {
          star.innerHTML = '<defs><linearGradient id="half"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="${tokens.border}"/></linearGradient></defs><path fill="url(#half)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
        } else {
          star.classList.add('empty');
          star.innerHTML = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
        }
        stars.appendChild(star);
      }
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        renderStars(input.rating || 0, input.max || 5);
        document.getElementById('rating').textContent = input.rating || 0;
        if (input.reviews) document.getElementById('reviews').textContent = input.reviews + ' reviews';
        if (input.label) document.getElementById('label').textContent = input.label;
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/kbd": {
    name: "Keyboard Shortcut",
    description: "Keyboard shortcut display",
    exampleInput: {
      shortcuts: [
        { keys: ["⌘", "K"], label: "Command palette" },
        { keys: ["⌘", "S"], label: "Save" },
        { keys: ["⌘", "⇧", "P"], label: "Open settings" },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 16px; overflow: auto; }
    .shortcut { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${tokens.border}; }
    .shortcut:last-child { border-bottom: none; }
    .label { font-size: 13px; color: ${tokens.textMuted}; }
    .keys { display: flex; gap: 4px; }
    kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 6px; font-family: inherit; font-size: 12px; font-weight: 500; background: ${tokens.bgSubtle}; border: 1px solid ${tokens.border}; border-radius: 6px; box-shadow: 0 1px 0 ${tokens.border}; }
  </style>
</head>
<body>
  <div class="container" id="container"></div>
  <script>
    function render(shortcuts) {
      document.getElementById('container').innerHTML = shortcuts.map(s =>
        '<div class="shortcut"><span class="label">' + s.label + '</span><div class="keys">' +
        s.keys.map(k => '<kbd>' + k + '</kbd>').join('') + '</div></div>'
      ).join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.shortcuts) render(input.shortcuts);
        else if (input.keys) render([{ keys: input.keys, label: input.label || '' }]);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/stats-grid": {
    name: "Stats Grid",
    description: "Grid of metric cards like a dashboard",
    exampleInput: {
      stats: [
        {
          label: "Total Revenue",
          value: "$1,250.00",
          trend: 12.5,
          trendLabel: "Trending up this month",
        },
        {
          label: "New Customers",
          value: "1,234",
          trend: -20,
          trendLabel: "Down 20% this period",
        },
        {
          label: "Active Accounts",
          value: "45,678",
          trend: 12.5,
          trendLabel: "Strong user retention",
        },
        {
          label: "Growth Rate",
          value: "4.5%",
          trend: 4.5,
          trendLabel: "Steady performance",
        },
      ],
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; padding: 12px; overflow: auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .card { padding: 16px; border: 1px solid ${tokens.border}; border-radius: 12px; background: ${tokens.bg}; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .label { font-size: 12px; font-weight: 500; color: ${tokens.textMuted}; }
    .badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 9999px; font-size: 10px; font-weight: 500; }
    .badge.up { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
    .badge.down { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
    .value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
    .trend-label { font-size: 11px; color: ${tokens.textMuted}; margin-top: 6px; display: flex; align-items: center; gap: 4px; }
    .trend-label svg { width: 12px; height: 12px; }
    @media (min-height: 450px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container"><div class="grid" id="grid"></div></div>
  <script>
    function render(stats) {
      document.getElementById('grid').innerHTML = stats.map(s => {
        const up = (s.trend || 0) >= 0;
        const arrow = up ? '<path d="M18 15l-6-6-6 6"/>' : '<path d="M6 9l6 6 6-6"/>';
        return '<div class="card">' +
          '<div class="header"><span class="label">' + s.label + '</span>' +
          (s.trend !== undefined ? '<span class="badge ' + (up ? 'up' : 'down') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10">' + arrow + '</svg>' + (up ? '+' : '') + s.trend + '%</span>' : '') +
          '</div><div class="value">' + s.value + '</div>' +
          (s.trendLabel ? '<div class="trend-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + arrow + '</svg>' + s.trendLabel + '</div>' : '') +
          '</div>';
      }).join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.stats) render(input.stats);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/area-chart": {
    name: "Area Chart",
    description: "Beautiful area chart with gradient fill",
    exampleInput: {
      title: "Total Visitors",
      subtitle: "Total for the last 3 months",
      data: [
        { label: "Jun 23", value: 2400 },
        { label: "Jun 24", value: 1398 },
        { label: "Jun 25", value: 4800 },
        { label: "Jun 26", value: 3908 },
        { label: "Jun 27", value: 4800 },
        { label: "Jun 28", value: 3800 },
        { label: "Jun 29", value: 4300 },
      ],
      tabs: ["Last 3 months", "Last 30 days", "Last 7 days"],
      activeTab: 2,
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; padding: 16px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
    .title-section { flex: 1; }
    .title { font-size: 16px; font-weight: 600; }
    .subtitle { font-size: 12px; color: ${tokens.textMuted}; margin-top: 2px; }
    .tabs { display: flex; background: ${tokens.bgSubtle}; border-radius: 8px; padding: 2px; }
    .tab { padding: 6px 12px; font-size: 11px; color: ${tokens.textMuted}; border-radius: 6px; cursor: pointer; white-space: nowrap; }
    .tab.active { background: ${tokens.bg}; color: ${tokens.text}; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .chart-container { flex: 1; position: relative; min-height: 100px; }
    svg { width: 100%; height: 100%; }
    .grid-line { stroke: ${tokens.border}; stroke-width: 1; }
    .area { fill: url(#gradient); }
    .line { fill: none; stroke: ${tokens.textMuted}; stroke-width: 2; }
    .labels { display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; color: ${tokens.textSubtle}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title-section">
        <div class="title" id="title">Chart</div>
        <div class="subtitle" id="subtitle"></div>
      </div>
      <div class="tabs" id="tabs"></div>
    </div>
    <div class="chart-container">
      <svg id="chart" viewBox="0 0 400 150" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${tokens.textMuted}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${tokens.textMuted}" stop-opacity="0.05"/>
          </linearGradient>
        </defs>
        <line class="grid-line" x1="0" y1="50" x2="400" y2="50"/>
        <line class="grid-line" x1="0" y1="100" x2="400" y2="100"/>
        <path class="area" id="area"/>
        <path class="line" id="line"/>
      </svg>
    </div>
    <div class="labels" id="labels"></div>
  </div>
  <script>
    function render(data) {
      if (!data || !data.length) return;
      const max = Math.max(...data.map(d => d.value));
      const width = 400, height = 150, padding = 5;
      const points = data.map((d, i) => ({
        x: (i / (data.length - 1)) * (width - padding * 2) + padding,
        y: height - (d.value / max) * (height - 20) - 10
      }));
      const linePath = 'M' + points.map(p => p.x + ',' + p.y).join(' L');
      const areaPath = linePath + ' L' + (width - padding) + ',' + height + ' L' + padding + ',' + height + ' Z';
      document.getElementById('line').setAttribute('d', linePath);
      document.getElementById('area').setAttribute('d', areaPath);
      document.getElementById('labels').innerHTML = data.map(d => '<span>' + d.label + '</span>').join('');
    }
    function renderTabs(tabs, active) {
      document.getElementById('tabs').innerHTML = tabs.map((t, i) =>
        '<div class="tab' + (i === active ? ' active' : '') + '">' + t + '</div>'
      ).join('');
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        if (input.title) document.getElementById('title').textContent = input.title;
        if (input.subtitle) document.getElementById('subtitle').textContent = input.subtitle;
        if (input.tabs) renderTabs(input.tabs, input.activeTab || 0);
        if (input.data) render(input.data);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },

  "ui://mesh/calendar": {
    name: "Calendar",
    description: "Mini calendar display",
    exampleInput: {
      month: 1,
      year: 2026,
      selected: [15, 16, 17],
      today: 23,
    },
    html: `<!DOCTYPE html>
<html>
<head>
  <style>
    ${baseCSS}
    .container { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    .header { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 280px; margin-bottom: 12px; }
    .month { font-size: 14px; font-weight: 500; }
    .nav { display: flex; gap: 4px; }
    .nav button { width: 28px; height: 28px; border: 1px solid ${tokens.border}; border-radius: 6px; background: ${tokens.bg}; cursor: pointer; font-size: 12px; }
    .weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; max-width: 280px; margin-bottom: 8px; }
    .weekday { font-size: 11px; color: ${tokens.textMuted}; text-align: center; padding: 4px; }
    .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; max-width: 280px; }
    .day { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; border-radius: 8px; cursor: pointer; }
    .day:hover { background: ${tokens.bgSubtle}; }
    .day.today { font-weight: 600; border: 1px solid ${tokens.primary}; }
    .day.selected { background: ${tokens.primary}; color: white; }
    .day.other { color: ${tokens.textSubtle}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="month" id="month">January 2026</span>
      <div class="nav"><button>‹</button><button>›</button></div>
    </div>
    <div class="weekdays">
      <span class="weekday">Su</span><span class="weekday">Mo</span><span class="weekday">Tu</span>
      <span class="weekday">We</span><span class="weekday">Th</span><span class="weekday">Fr</span><span class="weekday">Sa</span>
    </div>
    <div class="days" id="days"></div>
  </div>
  <script>
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    function render(month, year, selected = [], today = null) {
      document.getElementById('month').textContent = months[month - 1] + ' ' + year;
      const firstDay = new Date(year, month - 1, 1).getDay();
      const daysInMonth = new Date(year, month, 0).getDate();
      const days = document.getElementById('days');
      days.innerHTML = '';
      for (let i = 0; i < firstDay; i++) {
        days.innerHTML += '<div class="day other"></div>';
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today;
        const isSelected = selected.includes(d);
        days.innerHTML += '<div class="day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + '">' + d + '</div>';
      }
    }
    window.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.method === 'ui/initialize') {
        const input = msg.params?.toolInput || {};
        render(input.month || 1, input.year || 2026, input.selected || [], input.today);
        parent.postMessage(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }), '*');
      }
    });
  </script>
</body>
</html>`,
  },
};

/**
 * Get UI resource by URI
 */
export function getUIWidgetResource(uri: string): UIWidgetResource | undefined {
  return UI_WIDGET_RESOURCES[uri];
}

/**
 * List all UI widget resources
 */
export function listUIWidgetResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  exampleInput: Record<string, unknown>;
}> {
  return Object.entries(UI_WIDGET_RESOURCES).map(([uri, resource]) => ({
    uri,
    name: resource.name,
    description: resource.description,
    mimeType: "text/html;profile=mcp-app",
    exampleInput: resource.exampleInput,
  }));
}
