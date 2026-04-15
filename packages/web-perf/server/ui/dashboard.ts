import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .site-card {
    cursor: default;
    transition: box-shadow 0.15s;
  }
  .site-card:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .site-origin {
    font-size: 13px;
    color: var(--color-text-secondary, #64748b);
    font-family: var(--font-mono, monospace);
  }
  .score-circle {
    width: 48px; height: 48px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700;
    flex-shrink: 0;
  }
  .score-good { background: #dcfce7; color: #15803d; }
  .score-needs-improvement { background: #fef3c7; color: #a16207; }
  .score-poor { background: #fee2e2; color: #dc2626; }
  .metric-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 4px; font-size: 12px;
    background: var(--color-background-secondary, #f1f5f9);
  }
  .metric-dot {
    width: 6px; height: 6px; border-radius: 50%;
  }
  .snapshot-count {
    font-size: 11px;
    color: var(--color-text-secondary, #94a3b8);
  }
</style></head><body>
<div id="root">
  <div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
    <p class="muted text-sm">Loading performance data...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
var CWV = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 }
};

function rate(name, val) {
  if (val === undefined || val === null) return 'unknown';
  var t = CWV[name];
  if (!t) return 'unknown';
  if (val <= t.good) return 'good';
  if (val <= t.poor) return 'needs-improvement';
  return 'poor';
}

function rateScore(s) {
  if (s >= 90) return 'good';
  if (s >= 50) return 'needs-improvement';
  return 'poor';
}

function fmtMetric(name, val) {
  if (val === undefined || val === null) return '—';
  if (name === 'cls') return val.toFixed(2);
  if (val >= 1000) return (val / 1000).toFixed(1) + 's';
  return Math.round(val) + 'ms';
}

function ratingColor(r) {
  if (r === 'good') return '#0cce6b';
  if (r === 'needs-improvement') return '#ffa400';
  if (r === 'poor') return '#ff4e42';
  return '#94a3b8';
}

function renderSites(sites) {
  var root = document.getElementById('root');
  if (!sites || sites.length === 0) {
    root.innerHTML = '<div class="empty-state">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
      '<p class="font-semibold" style="margin-bottom:4px">No sites tracked yet</p>' +
      '<p class="muted text-sm">Use the <strong>initial-setup</strong> prompt or <strong>SITE_ADD</strong> tool to start monitoring.</p>' +
    '</div>';
    return;
  }

  var h = '<div style="margin-bottom:16px" class="flex justify-between">' +
    '<div class="font-semibold text-lg">Web Performance</div>' +
    '<div class="muted text-sm">' + sites.length + ' site' + (sites.length > 1 ? 's' : '') + '</div>' +
  '</div><div class="grid gap-3">';

  for (var i = 0; i < sites.length; i++) {
    var s = sites[i];
    var snap = s.latestSnapshot;
    var score = snap ? snap.performanceScore : null;
    var scoreR = score !== null && score !== undefined ? rateScore(score) : null;

    h += '<div class="card site-card">' +
      '<div class="flex gap-3">';

    if (score !== null && score !== undefined) {
      h += '<div class="score-circle score-' + scoreR + '">' + score + '</div>';
    }

    h += '<div style="flex:1;min-width:0">' +
      '<div class="font-semibold truncate">' + s.name + '</div>' +
      '<div class="site-origin truncate">' + s.origin + '</div>';

    if (snap) {
      h += '<div class="flex gap-2 mt-2" style="flex-wrap:wrap">';
      var metrics = ['lcp', 'inp', 'cls'];
      for (var j = 0; j < metrics.length; j++) {
        var m = metrics[j];
        var val = snap[m];
        var r = rate(m, val);
        h += '<div class="metric-pill">' +
          '<div class="metric-dot" style="background:' + ratingColor(r) + '"></div>' +
          '<span style="font-weight:600;text-transform:uppercase">' + m + '</span> ' +
          fmtMetric(m, val) +
        '</div>';
      }
      h += '</div>';
      h += '<div class="snapshot-count mt-1">' + s.snapshotCount + ' snapshot' + (s.snapshotCount > 1 ? 's' : '') +
        ' · last: ' + new Date(snap.timestamp).toLocaleDateString() + '</div>';
    } else {
      h += '<div class="muted text-sm mt-1">No snapshots yet</div>';
    }

    h += '</div></div></div>';
  }

  h += '</div>';
  root.innerHTML = h;
}

function onToolResult(result) {
  var data = result?.structuredContent || result;
  if (data?.sites) {
    renderSites(data.sites);
  } else if (data?.id && data?.name && data?.origin) {
    // Single site added — show it
    renderSites([{ id: data.id, name: data.name, origin: data.origin, snapshotCount: 0 }]);
  }
}
</script></body></html>`;
}
