import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

export function renderSearchResults(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .flight-card {
    border: 1px solid var(--color-border-primary, #e2e8f0);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .flight-card:last-child { margin-bottom: 0; }
  .route { display: flex; align-items: center; gap: 8px; }
  .time { font-weight: 600; font-size: 15px; }
  .airport { font-size: 12px; color: var(--color-text-secondary, #64748b); }
  .stops-info { font-size: 12px; color: var(--color-text-secondary, #64748b); text-align: center; }
  .stops-line { width: 60px; height: 1px; background: #cbd5e1; margin: 2px auto; position: relative; }
  .stops-dot { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; position: absolute; top: -2.5px; }
  .price-tag { font-size: 18px; font-weight: 700; color: #16a34a; text-align: right; }
  .duration { font-size: 12px; color: var(--color-text-secondary, #64748b); }
</style></head><body>
<div id="root">
  <div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h5l3-9 4 18 3-9h5"/></svg>
    <p class="muted text-sm">Waiting for search results...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
function formatTime(t) {
  if (!t) return '--:--';
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
function formatDuration(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? h + 'h ' + (m > 0 ? m + 'm' : '') : m + 'm';
}
function stopsLabel(n) {
  if (n === 0) return 'Nonstop';
  return n + ' stop' + (n > 1 ? 's' : '');
}

function onToolResult(result) {
  const data = result?.structuredContent || result;
  if (!data) return;
  const results = data.results || [];
  const error = data.error;
  const fallbackUrl = data.fallbackUrl;
  const root = document.getElementById('root');

  if (results.length === 0) {
    root.innerHTML = '<div class="empty-state">' +
      '<p class="text-sm muted">' + (error || 'No flights found.') + '</p>' +
      (fallbackUrl ? '<a href="' + fallbackUrl + '" target="_blank" style="margin-top:8px;color:#2563eb;font-size:13px;">Search on Google Flights ↗</a>' : '') +
      '</div>';
    resizeHeight(120);
    return;
  }

  const top = results.slice(0, 3);
  let html = '<div style="margin-bottom:8px"><span class="font-semibold text-sm">' + results.length + ' flights found</span></div>';

  top.forEach(function(r) {
    const legs = r.flights || [];
    const first = legs[0] || {};
    const last = legs[legs.length - 1] || {};
    html += '<div class="flight-card">' +
      '<div>' +
        '<div class="route">' +
          '<div><div class="time">' + formatTime(first.departure?.time) + '</div><div class="airport">' + (first.departure?.airport || '') + '</div></div>' +
          '<div class="stops-info">' +
            '<div>' + formatDuration(r.totalDurationMinutes) + '</div>' +
            '<div class="stops-line">' + (r.stops > 0 ? '<div class="stops-dot" style="left:50%"></div>' : '') + '</div>' +
            '<div>' + stopsLabel(r.stops) + '</div>' +
          '</div>' +
          '<div><div class="time">' + formatTime(last.arrival?.time) + '</div><div class="airport">' + (last.arrival?.airport || '') + '</div></div>' +
        '</div>' +
        '<div class="text-xs muted mt-2">' + (first.airline || '') + '</div>' +
      '</div>' +
      '<div class="price-tag">$' + (r.price || 0) + '</div>' +
    '</div>';
  });

  if (results.length > 3) {
    html += '<div style="text-align:center;margin-top:8px">' +
      '<button class="btn-ghost text-xs" onclick="sendMessage(\\'Show all ' + results.length + ' flight results\\')">View all ' + results.length + ' results</button>' +
    '</div>';
  }
  root.innerHTML = html;
  resizeHeight(Math.min(root.scrollHeight + 32, 400));
}
</script></body></html>`;
}
