import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

export function renderSiteDetail(apiOrigin: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .gauge-container { text-align: center; }
  .gauge-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); }
  .gauge-value { font-size: 20px; font-weight: 700; }
  .gauge-unit { font-size: 12px; color: var(--color-text-secondary, #64748b); }
  .gauge-rating { font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .histogram-bar { height: 12px; border-radius: 6px; overflow: hidden; display: flex; width: 100%; }
  .histogram-segment { height: 100%; transition: width 0.3s; }
  .perf-score-ring {
    width: 80px; height: 80px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: 700;
    margin: 0 auto;
  }
  .opportunity-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border-primary, #e2e8f0); }
  .opportunity-row:last-child { border-bottom: none; }
  .savings-badge { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
  .savings-critical { background: #fee2e2; color: #dc2626; }
  .savings-high { background: #fef3c7; color: #a16207; }
  .savings-medium { background: #e0e7ff; color: #4338ca; }
  .savings-low { background: #f1f5f9; color: #64748b; }
  .sparkline-container { position: relative; }
  .sparkline-label { position: absolute; top: 0; right: 0; font-size: 10px; color: var(--color-text-secondary, #94a3b8); }
  .cwv-pass { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; }
  .cwv-pass-true { background: #dcfce7; color: #15803d; }
  .cwv-pass-false { background: #fee2e2; color: #dc2626; }
  .tab-bar { display: flex; gap: 0; border-bottom: 2px solid var(--color-border-primary, #e2e8f0); margin-bottom: 16px; }
  .tab { padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; color: var(--color-text-secondary, #64748b); }
  .tab.active { color: var(--color-text-primary, #0f172a); border-bottom-color: var(--color-text-primary, #0f172a); }
  .tab:hover { color: var(--color-text-primary, #0f172a); }
  .panel { display: none; }
  .panel.active { display: block; }
</style></head><body>
<div id="root">
  <div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
    <p class="muted text-sm">Loading site details...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
var API_BASE = '${apiOrigin}';
var siteData = null;
var reportData = null;
var activeTab = 'overview';
var _pollTimer = null;

var CWV = {
  lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'LCP' },
  inp: { good: 200, poor: 500, unit: 'ms', label: 'INP' },
  cls: { good: 0.1, poor: 0.25, unit: '', label: 'CLS' },
  fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'FCP' },
  ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'TTFB' }
};

function rate(name, val) {
  var t = CWV[name];
  if (!t || val === undefined) return 'unknown';
  if (val <= t.good) return 'good';
  if (val <= t.poor) return 'needs-improvement';
  return 'poor';
}

function ratingColor(r) {
  if (r === 'good') return '#0cce6b';
  if (r === 'needs-improvement') return '#ffa400';
  if (r === 'poor') return '#ff4e42';
  return '#94a3b8';
}

function fmtVal(name, val) {
  if (val === undefined || val === null) return '\\u2014';
  if (name === 'cls') return val.toFixed(2);
  if (val >= 1000) return (val / 1000).toFixed(1) + 's';
  return Math.round(val) + 'ms';
}

function rateScore(s) {
  if (s >= 90) return 'good';
  if (s >= 50) return 'needs-improvement';
  return 'poor';
}

function renderGauge(name, p75) {
  var r = rate(name, p75);
  var c = ratingColor(r);
  var info = CWV[name];
  return '<div class="gauge-container">' +
    '<div class="gauge-label">' + info.label + '</div>' +
    '<div class="gauge-value" style="color:' + c + '">' + fmtVal(name, p75) + '</div>' +
    '<div class="gauge-rating" style="color:' + c + '">' + r.replace('-', ' ') + '</div>' +
  '</div>';
}

function renderHistogram(name, metric) {
  if (!metric || !metric.histogram) return '';
  var h = metric.histogram;
  var good = (h[0]?.density || 0) * 100;
  var ni = (h[1]?.density || 0) * 100;
  var poor = (h[2]?.density || 0) * 100;
  return '<div style="margin-bottom:8px">' +
    '<div class="flex justify-between mb-1">' +
      '<span class="text-xs font-semibold">' + CWV[name].label + '</span>' +
      '<span class="text-xs muted">p75: ' + fmtVal(name, metric.percentiles.p75) + '</span>' +
    '</div>' +
    '<div class="histogram-bar">' +
      '<div class="histogram-segment" style="width:' + good + '%;background:#0cce6b"></div>' +
      '<div class="histogram-segment" style="width:' + ni + '%;background:#ffa400"></div>' +
      '<div class="histogram-segment" style="width:' + poor + '%;background:#ff4e42"></div>' +
    '</div>' +
    '<div class="flex justify-between mt-1">' +
      '<span class="text-xs color-good">' + good.toFixed(0) + '% good</span>' +
      '<span class="text-xs color-needs-improvement">' + ni.toFixed(0) + '% needs imp.</span>' +
      '<span class="text-xs color-poor">' + poor.toFixed(0) + '% poor</span>' +
    '</div>' +
  '</div>';
}

function renderSparkline(name, historyRecord, periods) {
  if (!historyRecord || !historyRecord.percentilesTimeseries) return '';
  var values = historyRecord.percentilesTimeseries.p75s;
  if (!values || values.length < 2) return '';

  var info = CWV[name];
  var w = 280, h = 60, pad = 2;
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  if (min === max) { min = min * 0.9; max = max * 1.1; }
  var range = max - min || 1;

  var points = '';
  for (var i = 0; i < values.length; i++) {
    var x = pad + (i / (values.length - 1)) * (w - pad * 2);
    var y = pad + (1 - (values[i] - min) / range) * (h - pad * 2);
    points += x + ',' + y + ' ';
  }

  // Threshold line
  var threshY = pad + (1 - (info.good - min) / range) * (h - pad * 2);
  threshY = Math.max(pad, Math.min(h - pad, threshY));

  var latest = values[values.length - 1];
  var latestR = rate(name, latest);

  return '<div class="sparkline-container" style="margin-bottom:12px">' +
    '<div class="flex justify-between mb-1">' +
      '<span class="text-xs font-semibold">' + info.label + ' Trend</span>' +
      '<span class="text-xs font-semibold" style="color:' + ratingColor(latestR) + '">' + fmtVal(name, latest) + '</span>' +
    '</div>' +
    '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<line x1="' + pad + '" y1="' + threshY + '" x2="' + (w - pad) + '" y2="' + threshY + '" stroke="#0cce6b" stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>' +
      '<polyline points="' + points.trim() + '" fill="none" stroke="' + ratingColor(latestR) + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + (pad + ((values.length - 1) / (values.length - 1)) * (w - pad * 2)) + '" cy="' + (pad + (1 - (latest - min) / range) * (h - pad * 2)) + '" r="3" fill="' + ratingColor(latestR) + '"/>' +
    '</svg>' +
    '<div class="flex justify-between">' +
      '<span class="text-xs muted">' + (periods && periods[0] ? periods[0].firstDate : '') + '</span>' +
      '<span class="text-xs muted">' + (periods && periods[periods.length - 1] ? periods[periods.length - 1].lastDate : '') + '</span>' +
    '</div>' +
  '</div>';
}

function renderOpportunities(opps) {
  if (!opps || opps.length === 0) return '<p class="muted text-sm">No optimization opportunities found.</p>';
  var h = '';
  for (var i = 0; i < Math.min(opps.length, 10); i++) {
    var o = opps[i];
    var savingsMs = o.details?.overallSavingsMs || o.savingsMs || 0;
    var savingsBytes = o.details?.overallSavingsBytes || o.savingsBytes || 0;
    var priority = savingsMs >= 1000 ? 'critical' : savingsMs >= 500 ? 'high' : savingsMs >= 100 ? 'medium' : 'low';
    var savingsText = '';
    if (savingsMs > 0) savingsText += Math.round(savingsMs) + 'ms';
    if (savingsBytes > 0) savingsText += (savingsText ? ' / ' : '') + Math.round(savingsBytes / 1024) + 'KB';

    h += '<div class="opportunity-row">' +
      '<div style="flex:1;min-width:0">' +
        '<div class="text-sm font-medium truncate">' + (o.title || '') + '</div>' +
        (o.displayValue ? '<div class="text-xs muted">' + o.displayValue + '</div>' : '') +
      '</div>' +
      (savingsText ? '<div class="savings-badge savings-' + priority + '">' + savingsText + '</div>' : '') +
    '</div>';
  }
  return h;
}

function render() {
  var root = document.getElementById('root');
  var site = siteData?.site || siteData;
  var report = reportData?.report;

  if (!site || !site.name) {
    if (report) site = report.site;
    if (!site) return;
  }

  var snap = site.snapshots ? site.snapshots[0] : (siteData?.snapshot || null);
  var crux = snap?.crux?.phone || snap?.crux?.all;
  var ps = snap?.pagespeed;
  var history = site.cruxHistory;

  var html = '<div class="flex justify-between mb-3">' +
    '<div>' +
      '<div class="font-semibold text-lg">' + site.name + '</div>' +
      '<div class="text-sm muted" style="font-family:var(--font-mono,monospace)">' + site.origin + '</div>' +
    '</div>';

  if (crux) {
    var lcp = crux.lcp?.percentiles.p75;
    var inp = crux.inp?.percentiles.p75;
    var cls = crux.cls?.percentiles.p75;
    var pass = lcp !== undefined && inp !== undefined && cls !== undefined &&
      lcp <= 2500 && inp <= 200 && cls <= 0.1;
    html += '<div class="cwv-pass cwv-pass-' + pass + '">' + (pass ? 'CWV Passed' : 'CWV Failed') + '</div>';
  }
  html += '</div>';

  // Tab bar
  html += '<div class="tab-bar">' +
    '<div class="tab' + (activeTab === 'overview' ? ' active' : '') + '" onclick="switchTab(\'overview\')">Overview</div>' +
    '<div class="tab' + (activeTab === 'histograms' ? ' active' : '') + '" onclick="switchTab(\'histograms\')">Distributions</div>' +
    '<div class="tab' + (activeTab === 'trends' ? ' active' : '') + '" onclick="switchTab(\'trends\')">Trends</div>' +
    '<div class="tab' + (activeTab === 'opportunities' ? ' active' : '') + '" onclick="switchTab(\'opportunities\')">Opportunities</div>' +
  '</div>';

  // Overview panel
  html += '<div class="panel' + (activeTab === 'overview' ? ' active' : '') + '" id="panel-overview">';
  if (ps) {
    var sr = rateScore(ps.performanceScore);
    html += '<div style="margin-bottom:20px;text-align:center">' +
      '<div class="perf-score-ring" style="border:4px solid ' + ratingColor(sr) + '">' + ps.performanceScore + '</div>' +
      '<div class="text-xs muted mt-1">Performance Score (' + ps.strategy + ')</div>' +
    '</div>';
  }
  if (crux) {
    html += '<div class="grid grid-5 gap-3 mb-4">';
    var metrics = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
    for (var i = 0; i < metrics.length; i++) {
      var m = metrics[i];
      if (crux[m]) html += renderGauge(m, crux[m].percentiles.p75);
    }
    html += '</div>';
  }

  if (report) {
    if (report.recommendations && report.recommendations.length > 0) {
      html += '<div class="section-title mt-4">Key Recommendations</div>';
      for (var r = 0; r < report.recommendations.length; r++) {
        html += '<div class="card mb-2 text-sm">' + report.recommendations[r] + '</div>';
      }
    }
    if (report.trendSummary) {
      html += '<div class="section-title mt-4">Trend Summary</div>' +
        '<div class="card text-sm">' + report.trendSummary + '</div>';
    }
  }

  if (snap) {
    html += '<div class="text-xs muted mt-3">Snapshot: ' + new Date(snap.timestamp).toLocaleString() + '</div>';
  }
  html += '</div>';

  // Histograms panel
  html += '<div class="panel' + (activeTab === 'histograms' ? ' active' : '') + '" id="panel-histograms">';
  if (crux) {
    html += '<div class="section-title">CrUX Field Data Distribution</div>';
    var hMetrics = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
    for (var i = 0; i < hMetrics.length; i++) {
      if (crux[hMetrics[i]]) html += renderHistogram(hMetrics[i], crux[hMetrics[i]]);
    }
    if (snap?.crux?.collectionPeriod) {
      html += '<div class="text-xs muted mt-2">Collection period: ' +
        snap.crux.collectionPeriod.firstDate + ' to ' + snap.crux.collectionPeriod.lastDate + '</div>';
    }
  } else {
    html += '<p class="muted text-sm">No CrUX field data available. The site may not have enough traffic.</p>';
  }
  html += '</div>';

  // Trends panel
  html += '<div class="panel' + (activeTab === 'trends' ? ' active' : '') + '" id="panel-trends">';
  if (history && history.record) {
    html += '<div class="section-title">25-Week Trends (CrUX History)</div>';
    var tMetrics = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
    for (var i = 0; i < tMetrics.length; i++) {
      if (history.record[tMetrics[i]]) {
        html += renderSparkline(tMetrics[i], history.record[tMetrics[i]], history.collectionPeriods);
      }
    }
  } else {
    html += '<p class="muted text-sm">No trend data available. Use CRUX_HISTORY to fetch historical data.</p>';
  }
  html += '</div>';

  // Opportunities panel
  html += '<div class="panel' + (activeTab === 'opportunities' ? ' active' : '') + '" id="panel-opportunities">';
  var opps = report?.opportunities || ps?.opportunities;
  if (opps) {
    html += '<div class="section-title">Optimization Opportunities</div>';
    html += renderOpportunities(opps);
  } else {
    html += '<p class="muted text-sm">No opportunity data. Run PERF_SNAPSHOT to collect PageSpeed data.</p>';
  }
  html += '</div>';

  root.innerHTML = html;
}

function switchTab(tab) {
  activeTab = tab;
  render();
}

function onToolResult(result) {
  var data = result?.structuredContent || result;
  if (!data) return;

  if (data.report) {
    reportData = data;
    if (data.report.site) {
      // Load full site data for context
      siteData = siteData || { site: data.report.site };
    }
  }
  if (data.site && data.site.snapshots !== undefined) {
    siteData = data;
  }
  if (data.snapshot) {
    // From PERF_SNAPSHOT — merge into siteData
    if (!siteData) siteData = { site: data.site || {} };
    if (!siteData.site) siteData.site = data.site || {};
    if (!siteData.site.snapshots) siteData.site.snapshots = [];
    siteData.site.snapshots.unshift(data.snapshot);
  }
  if (data.history) {
    if (siteData && siteData.site) siteData.site.cruxHistory = data.history;
    else siteData = { site: { cruxHistory: data.history, ...(data.site || {}) } };
  }
  render();
}
</script></body></html>`;
}
