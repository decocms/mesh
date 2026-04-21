import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

export function renderTripCard(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .trip-header { display: flex; align-items: flex-start; justify-content: space-between; }
  .trip-name { font-size: 16px; font-weight: 600; }
  .route-display {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 14px;
  }
  .airport-code {
    font-weight: 600;
    background: var(--color-background-secondary, #f1f5f9);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--font-mono, monospace);
  }
  .date-range { margin-top: 8px; font-size: 13px; }
  .stats { display: flex; gap: 16px; margin-top: 12px; }
  .stat { text-align: center; }
  .stat-value { font-size: 18px; font-weight: 700; }
  .stat-label { font-size: 11px; color: var(--color-text-secondary, #64748b); text-transform: uppercase; }
  .prefs-list { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
  .pref-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: #f1f5f9;
    color: #475569;
  }
</style></head><body>
<div id="root">
  <div class="empty-state">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7l6 6-6 6"/><path d="M21 7l-6 6 6 6"/></svg>
    <p class="muted text-sm">Loading trip...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function onToolResult(result) {
  const data = result?.structuredContent || result;
  const trip = data?.trip || data;
  if (!trip || !trip.name) return;
  const root = document.getElementById('root');

  const statusClass = 'badge badge-' + trip.status;
  const dests = (trip.destinations || []).join(', ');
  const resultCount = (trip.results || []).length;
  const bestPrice = resultCount > 0
    ? Math.min(...trip.results.map(function(r) { return r.price; }))
    : null;

  let prefsHtml = '';
  const p = trip.preferences || {};
  if (p.maxStops !== undefined) prefsHtml += '<span class="pref-tag">Max ' + p.maxStops + ' stop' + (p.maxStops !== 1 ? 's' : '') + '</span>';
  if (p.maxLayoverHours) prefsHtml += '<span class="pref-tag">Layover &lt;' + p.maxLayoverHours + 'h</span>';
  if (p.maxPrice) prefsHtml += '<span class="pref-tag">Budget $' + p.maxPrice + '</span>';
  if (p.preferredAirports?.length) prefsHtml += '<span class="pref-tag">Prefer: ' + p.preferredAirports.join(', ') + '</span>';

  let html = '<div class="trip-header">' +
    '<div class="trip-name">' + trip.name + '</div>' +
    '<span class="' + statusClass + '">' + trip.status + '</span>' +
  '</div>' +
  '<div class="route-display">' +
    '<span class="airport-code">' + trip.origin + '</span>' +
    '<span class="arrow">→</span>' +
    '<span class="airport-code">' + dests + '</span>' +
  '</div>' +
  '<div class="date-range muted">' +
    formatDate(trip.earliestDeparture) + ' – ' + formatDate(trip.latestReturn) +
    ' · ' + trip.tripLengthDays.min + '–' + trip.tripLengthDays.max + ' days' +
  '</div>';

  if (prefsHtml) {
    html += '<div class="prefs-list">' + prefsHtml + '</div>';
  }

  if (trip.status === 'complete' && resultCount > 0) {
    html += '<div class="stats">' +
      '<div class="stat"><div class="stat-value price">$' + bestPrice + '</div><div class="stat-label">Best Price</div></div>' +
      '<div class="stat"><div class="stat-value">' + resultCount + '</div><div class="stat-label">Options</div></div>' +
      '<div class="stat"><div class="stat-value">' + (trip.searchPlan?.searches?.length || 0) + '</div><div class="stat-label">Searches</div></div>' +
    '</div>';
  } else if (trip.searchPlan) {
    html += '<div class="mt-2 text-sm muted">' + trip.searchPlan.searches.length + ' searches planned</div>';
  }

  root.innerHTML = html;
  resizeHeight(Math.min(root.scrollHeight + 32, 280));
}
</script></body></html>`;
}
