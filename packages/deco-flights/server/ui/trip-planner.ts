import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

const API_BASE = `http://localhost:${Number(process.env.PORT) || 4747}`;

export function renderTripPlanner(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .planner { max-width: 1000px; margin: 0 auto; }
  .trip-banner {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
    color: white;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 16px;
  }
  .trip-banner h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .trip-banner .route { font-size: 16px; opacity: 0.85; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .trip-banner .code { font-family: var(--font-mono, monospace); font-weight: 600; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 4px; }
  .trip-banner .meta { margin-top: 8px; font-size: 13px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; }
  .tasks-section { margin-bottom: 20px; }
  .tasks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .tasks-progress { display: flex; align-items: center; gap: 8px; }
  .progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; min-width: 120px; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .progress-fill.active { background: linear-gradient(90deg, #3b82f6, #60a5fa); animation: shimmer 1.5s infinite; }
  .progress-fill.done { background: #16a34a; }
  @keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
  .tasks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px; }
  .task-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; font-size: 12px; border: 1px solid var(--color-border-primary, #e2e8f0); }
  .task-item.pending { opacity: 0.35; }
  .task-item.running { border-color: #3b82f6; background: #eff6ff; }
  .task-item.done { border-color: #86efac; background: #f0fdf4; }
  .task-item.error { border-color: #fca5a5; background: #fef2f2; }
  .task-route { font-weight: 500; white-space: nowrap; }
  .task-date { color: var(--color-text-secondary, #64748b); white-space: nowrap; }
  .task-meta { margin-left: auto; font-size: 11px; color: var(--color-text-secondary, #64748b); white-space: nowrap; }
  .spinner-sm { width: 14px; height: 14px; border: 2px solid #93c5fd; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .top-picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .pick-card { border: 2px solid var(--color-border-primary, #e2e8f0); border-radius: 10px; padding: 14px 16px; }
  .pick-card.rank-1 { border-color: #f59e0b; background: #fffbeb; }
  .pick-card.rank-2 { border-color: #94a3b8; background: #f8fafc; }
  .pick-card.rank-3 { border-color: #f97316; background: #fff7ed; }
  .pick-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .pick-price { font-size: 22px; font-weight: 700; color: #16a34a; }
  .pick-route { font-size: 13px; margin-bottom: 4px; }
  .pick-details { font-size: 12px; color: var(--color-text-secondary, #64748b); }
  .pick-score { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .section-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); margin-bottom: 12px; margin-top: 4px; }
  .results-table-wrap { border: 1px solid var(--color-border-primary, #e2e8f0); border-radius: 10px; overflow: hidden; }
  .sort-btn { background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); padding: 0; }
  .sort-btn:hover, .sort-btn.active { color: var(--color-text-primary, #0f172a); }
  .prefs-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .pref-chip { padding: 4px 10px; border-radius: 6px; font-size: 12px; background: #f1f5f9; color: #475569; }
  .live-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #16a34a; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #16a34a; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
</style></head><body>
<div id="root" class="planner">
  <div class="empty-state">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 5.5L5 7l2.5-2.5"/><path d="M3.5 11.5L5 13l2.5-2.5"/><path d="M3.5 17.5L5 19l2.5-2.5"/><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/></svg>
    <p class="muted">Loading trip details...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
var sortField = 'rank', sortAsc = true, tripData = null, workerRunning = false, _pollTimer = null;

function fmt(t) { if (!t) return '--:--'; var d = new Date(t); return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}); }
function fmtD(d) { if (!d) return ''; return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function fmtDur(m) { if (!m) return ''; var h=Math.floor(m/60),r=m%60; return h>0?h+'h'+(r>0?' '+r+'m':''):r+'m'; }
function stops(n) { return n===0?'Nonstop':n+' stop'+(n>1?'s':''); }

function taskIcon(s) {
  if (s==='running') return '<div class="spinner-sm"></div>';
  if (s==='done') return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#16a34a" stroke-width="2"><path d="M3 8l3.5 3.5L13 5"/></svg>';
  if (s==='error') return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#dc2626" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  return '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="8" cy="8" r="5"/></svg>';
}

function renderTasks(trip) {
  var tasks = trip.searchTasks || [];
  if (!tasks.length) return '';
  var dn = tasks.filter(function(t){return t.status==='done';}).length;
  var er = tasks.filter(function(t){return t.status==='error';}).length;
  var rn = tasks.filter(function(t){return t.status==='running';}).length;
  var tot = tasks.length;
  var pct = Math.round(((dn+er)/tot)*100);
  var isActive = workerRunning || rn > 0;

  var h = '<div class="tasks-section">';
  h += '<div class="tasks-header">';
  h += '<div style="display:flex;align-items:center;gap:8px"><span class="section-title" style="margin:0">Search Tasks</span>';
  if (isActive) h += '<span class="live-badge"><span class="live-dot"></span>LIVE</span>';
  h += '</div>';
  h += '<div class="tasks-progress"><span class="text-xs muted">' + dn + '/' + tot + (er?' · '+er+' err':'') + '</span>';
  h += '<div class="progress-bar" style="width:140px"><div class="progress-fill '+(isActive?'active':'done')+'" style="width:'+pct+'%"></div></div></div></div>';

  // Show running first, then done (recent), then pending
  var sorted = tasks.slice().sort(function(a,b) {
    var ord = {running:0,error:1,done:2,pending:3};
    return (ord[a.status]||3) - (ord[b.status]||3);
  });

  h += '<div class="tasks-grid">';
  sorted.forEach(function(t) {
    var ms = t.durationMs ? (t.durationMs/1000).toFixed(1)+'s' : '';
    h += '<div class="task-item '+t.status+'">';
    h += taskIcon(t.status);
    h += '<span class="task-route">'+t.spec.from+'→'+t.spec.to+'</span>';
    h += '<span class="task-date">'+fmtD(t.spec.departDate)+'</span>';
    h += '<span class="task-meta">';
    if (t.status==='done') h += t.resultCount+' results';
    else if (t.status==='error') h += '<span style="color:#dc2626">err</span>';
    else if (t.status==='running') h += 'searching…';
    if (ms) h += ' · '+ms;
    h += '</span></div>';
  });
  h += '</div></div>';
  return h;
}

function getCurrency(trip){var r=(trip.results||[])[0];return(r&&r.currency)?r.currency:'USD';}
function fmtPrice(amount,cur){
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD',maximumFractionDigits:0}).format(amount);}
  catch(e){return cur+' '+amount;}
}

function render() {
  var trip = tripData;
  if (!trip) return;
  var root = document.getElementById('root');
  var results = trip.results || [];

  var h = '<div class="trip-banner"><h1>'+trip.name+'</h1>';
  h += '<div class="route"><span class="code">'+trip.origin+'</span><span style="opacity:0.5">→</span><span class="code">'+trip.destinations.join(', ')+'</span>';
  h += '<span class="badge badge-'+trip.status+'" style="margin-left:12px">'+trip.status+'</span></div>';
  h += '<div class="meta"><span>'+fmtD(trip.earliestDeparture)+' – '+fmtD(trip.latestReturn)+'</span>';
  h += '<span>'+trip.tripLengthDays.min+'–'+trip.tripLengthDays.max+' days</span>';
  h += '<span>'+trip.passengers+' pax · '+trip.seatClass+'</span>';
  if (results.length) { var bp=Math.min.apply(null,results.map(function(r){return r.price;})); var cur=getCurrency(trip); h+='<span style="color:#4ade80;font-weight:700">Best: '+fmtPrice(bp,cur)+'</span>'; }
  h += '</div></div>';

  var p = trip.preferences || {};
  var prefs = [];
  if (p.maxStops!==undefined) prefs.push('Max '+p.maxStops+' stops');
  if (p.maxLayoverHours) prefs.push('Layover <'+p.maxLayoverHours+'h');
  if (p.maxPrice) prefs.push('Budget $'+p.maxPrice);
  if (p.preferredAirports&&p.preferredAirports.length) prefs.push('Prefer: '+p.preferredAirports.join(', '));
  if (prefs.length) { h+='<div class="prefs-grid">'; prefs.forEach(function(pr){h+='<div class="pref-chip">'+pr+'</div>';}); h+='</div>'; }

  h += renderTasks(trip);

  if (results.length === 0 && trip.status === 'draft') {
    h += '<div class="card p-4" style="text-align:center"><p class="font-semibold">'+(trip.searchPlan?trip.searchPlan.searches.length:0)+' searches planned</p>';
    h += '<button class="btn-primary mt-4" onclick="sendMessage(\\'Execute research for trip '+trip.id+'\\')">Execute Research</button></div>';
    root.innerHTML = h; return;
  }
  if (!results.length) { root.innerHTML = h; return; }

  var top3 = results.slice(0,3);
  h += '<div class="section-title">Top Picks</div><div class="top-picks">';
  top3.forEach(function(r,i) {
    var legs=r.flights||[], f=legs[0]||{}, l=legs[legs.length-1]||{};
    h += '<div class="pick-card rank-'+(i+1)+'">';
    h += '<div class="pick-header"><div class="rank-badge rank-'+(i<3?i+1:'other')+'">#'+r.rank+'</div><div class="pick-price">'+fmtPrice(r.price,r.currency)+'</div></div>';
    h += '<div class="pick-route"><strong>'+fmt(f.departure?.time)+'</strong> '+(f.departure?.airport||'')+' → <strong>'+fmt(l.arrival?.time)+'</strong> '+(l.arrival?.airport||'')+'</div>';
    h += '<div class="pick-details">'+fmtDur(r.totalDurationMinutes)+' · '+stops(r.stops)+' · '+(f.airline||'')+' · '+fmtD(r.searchSpec?.departDate)+'–'+fmtD(r.searchSpec?.returnDate)+'</div>';
    h += '<div class="pick-score"><div class="score-bar" style="flex:1"><div class="score-fill" style="width:'+Math.round(r.score*100)+'%"></div></div><span class="text-xs muted">'+Math.round(r.score*100)+'%</span></div>';
    h += '</div>';
  });
  h += '</div>';

  var sorted = results.slice().sort(function(a,b) {
    var va,vb;
    if (sortField==='price'){va=a.price;vb=b.price;}
    else if (sortField==='duration'){va=a.totalDurationMinutes;vb=b.totalDurationMinutes;}
    else if (sortField==='stops'){va=a.stops;vb=b.stops;}
    else {va=a.rank;vb=b.rank;}
    return sortAsc?(va-vb):(vb-va);
  });

  h += '<div class="section-title">All Results ('+results.length+')</div>';
  h += '<div class="results-table-wrap"><table><thead><tr>';
  h += '<th style="width:36px">#</th><th>Date</th><th>Route</th><th>Times</th>';
  h += '<th><button class="sort-btn'+(sortField==='duration'?' active':'')+'" onclick="setSort(\\'duration\\')">Dur ↕</button></th>';
  h += '<th><button class="sort-btn'+(sortField==='stops'?' active':'')+'" onclick="setSort(\\'stops\\')">Stops ↕</button></th>';
  h += '<th><button class="sort-btn'+(sortField==='price'?' active':'')+'" onclick="setSort(\\'price\\')">Price ↕</button></th>';
  h += '<th style="width:50px">Score</th></tr></thead><tbody>';

  sorted.slice(0,50).forEach(function(r) {
    var legs=r.flights||[], f=legs[0]||{}, l=legs[legs.length-1]||{};
    h += '<tr><td><span class="rank-badge rank-'+(r.rank<=3?r.rank:'other')+'">'+r.rank+'</span></td>';
    h += '<td class="text-sm">'+fmtD(r.searchSpec?.departDate)+'<br><span class="muted">'+fmtD(r.searchSpec?.returnDate)+'</span></td>';
    h += '<td class="text-sm font-medium">'+(f.departure?.airport||'')+' → '+(l.arrival?.airport||'')+'</td>';
    h += '<td class="text-sm">'+fmt(f.departure?.time)+' – '+fmt(l.arrival?.time)+'</td>';
    h += '<td class="text-sm">'+fmtDur(r.totalDurationMinutes)+'</td>';
    h += '<td class="text-sm">'+stops(r.stops)+'</td>';
    h += '<td class="font-semibold price">'+fmtPrice(r.price,r.currency)+'</td>';
    h += '<td><div class="score-bar"><div class="score-fill" style="width:'+Math.round(r.score*100)+'%"></div></div></td></tr>';
  });
  h += '</tbody></table></div>';
  root.innerHTML = h;
}

function setSort(f) { if (sortField===f) sortAsc=!sortAsc; else { sortField=f; sortAsc=true; } render(); }

var API_BASE = '${API_BASE}';

function startPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(function() {
    if (!tripData || !tripData.id) return;
    fetch(API_BASE + '/api/trips/' + tripData.id).then(function(r){return r.json();}).then(function(data) {
      if (data && data.trip) {
        tripData = data.trip;
        workerRunning = !!data.workerRunning;
        render();
        if (!workerRunning && tripData.status !== 'researching') {
          clearInterval(_pollTimer);
          _pollTimer = null;
        }
      }
    }).catch(function(){});
  }, 2000);
}

function onToolResult(result) {
  var data = result?.structuredContent || result;
  if (data?.trip) {
    tripData = data.trip;
    workerRunning = !!data.workerRunning;
  } else if (data?.started !== undefined) {
    // TRIP_EXECUTE response — just start polling
    workerRunning = true;
  }
  render();
  if (workerRunning || (tripData && tripData.status === 'researching')) {
    startPolling();
  }
}
</script></body></html>`;
}
