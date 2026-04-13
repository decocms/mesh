import { SHARED_STYLES, APPBRIDGE_SCRIPT } from "./shared-styles.ts";

const API_BASE = `http://localhost:${Number(process.env.PORT) || 4747}`;

export function renderTripsDashboard(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${SHARED_STYLES}
  .app { max-width: 1000px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .back-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--color-text-secondary, #64748b); cursor: pointer; background: none; border: none; padding: 4px 8px; border-radius: 6px; font-family: inherit; }
  .back-btn:hover { background: var(--color-background-secondary, #f1f5f9); color: var(--color-text-primary, #0f172a); }
  .filters { display: flex; gap: 4px; margin-bottom: 16px; }
  .filter-btn { padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; background: transparent; color: var(--color-text-secondary, #64748b); border: 1px solid transparent; font-family: inherit; cursor: pointer; }
  .filter-btn:hover { background: var(--color-background-secondary, #f1f5f9); }
  .filter-btn.active { background: var(--color-background-primary, #fff); border-color: var(--color-border-primary, #e2e8f0); color: var(--color-text-primary, #0f172a); font-weight: 600; }
  .trips-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .trip-item { border: 1px solid var(--color-border-primary, #e2e8f0); border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; }
  .trip-item:hover { border-color: #94a3b8; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .trip-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
  .trip-route { font-size: 13px; color: var(--color-text-secondary, #64748b); }
  .trip-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; }
  .trip-price { font-weight: 700; color: #16a34a; font-size: 15px; }
  .count-badge { background: var(--color-background-secondary, #f1f5f9); padding: 0 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .trip-banner { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
  .trip-banner h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .trip-banner .route { font-size: 16px; opacity: 0.85; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .trip-banner .code { font-family: var(--font-mono, monospace); font-weight: 600; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 4px; }
  .trip-banner .meta { margin-top: 8px; font-size: 13px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; }
  .tasks-section { margin-bottom: 20px; }
  .tasks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; min-width: 120px; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .progress-fill.active { background: linear-gradient(90deg, #3b82f6, #60a5fa); animation: shimmer 1.5s infinite; }
  .progress-fill.done { background: #16a34a; }
  @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.7} }
  .tasks-grid { display: flex; flex-direction: column; gap: 4px; }
  .task-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; font-size: 13px; border: 1px solid var(--color-border-primary, #e2e8f0); }
  .task-item.pending { opacity: 0.35; }
  .task-item.running { border-color: #3b82f6; background: #eff6ff; }
  .task-item.done { border-color: #86efac; background: #f0fdf4; }
  .task-item.error { border-color: #fca5a5; background: #fef2f2; }
  .task-route { font-weight: 500; white-space: nowrap; }
  .task-date { color: var(--color-text-secondary, #64748b); white-space: nowrap; }
  .task-meta { margin-left: auto; font-size: 11px; color: var(--color-text-secondary, #64748b); white-space: nowrap; }
  .spinner-sm { width: 14px; height: 14px; border: 2px solid #93c5fd; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .top-picks { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .pick-card { border: 2px solid var(--color-border-primary, #e2e8f0); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 16px; }
  .pick-card.rank-1 { border-color: #f59e0b; background: #fffbeb; }
  .pick-card.rank-2 { border-color: #94a3b8; background: #f8fafc; }
  .pick-card.rank-3 { border-color: #f97316; background: #fff7ed; }
  .pick-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .pick-price { font-size: 22px; font-weight: 700; color: #16a34a; }
  .pick-route { font-size: 13px; margin-bottom: 4px; }
  .pick-details { font-size: 12px; color: var(--color-text-secondary, #64748b); }
  .pick-score { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .section-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); margin-bottom: 12px; margin-top: 4px; }
  .results-table-wrap { border: 1px solid var(--color-border-primary, #e2e8f0); border-radius: 10px; overflow: hidden; overflow-x: auto; }
  .sort-btn { background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary, #64748b); padding: 0; font-family: inherit; }
  .sort-btn:hover, .sort-btn.active { color: var(--color-text-primary, #0f172a); }
  .prefs-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .pref-chip { padding: 4px 10px; border-radius: 6px; font-size: 12px; background: #f1f5f9; color: #475569; }
  .live-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #16a34a; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #16a34a; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .action-bar { display: flex; gap: 8px; margin-bottom: 16px; }
</style></head><body>
<div id="root" class="app">
  <div class="empty-state">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
    <p class="muted">Loading trips...</p>
  </div>
</div>
${APPBRIDGE_SCRIPT}
<script>
var currentView = 'list';
var allTrips = []; // full Trip objects with workerRunning flag
var currentFilter = 'all';
var detailTripId = null;
var sortField = 'price', sortAsc = true;
var _pollTimer = null;

function fmt(t){if(!t)return'--:--';var d=new Date(t);return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});}
function fmtD(d){if(!d)return'';return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});}
function fmtDur(m){if(!m)return'';var h=Math.floor(m/60),r=m%60;return h>0?h+'h'+(r>0?' '+r+'m':''):r+'m';}
function nStops(n){return n===0?'Nonstop':n+' stop'+(n>1?'s':'');}
function getCurrency(trip){var r=(trip.results||[])[0];return(r&&r.currency)?r.currency:'USD';}
function copyUrl(url){navigator.clipboard.writeText(url).then(function(){}).catch(function(){window.prompt('Copy this URL:',url);});}
function fmtPrice(amount,cur){
  try{return new Intl.NumberFormat(undefined,{style:'currency',currency:cur||'USD',maximumFractionDigits:0}).format(amount);}
  catch(e){return cur+' '+amount;}
}
function taskIcon(s){
  if(s==='running')return'<div class="spinner-sm"></div>';
  if(s==='done')return'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#16a34a" stroke-width="2"><path d="M3 8l3.5 3.5L13 5"/></svg>';
  if(s==='error')return'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#dc2626" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  return'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="8" cy="8" r="5"/></svg>';
}
function getTrip(id){return allTrips.find(function(t){return t.id===id;});}

// ===== LIST VIEW — table layout, sorted by creation date ===
function renderList() {
  var filtered = currentFilter==='all'?allTrips:allTrips.filter(function(t){return t.status===currentFilter;});
  // Sort by creation date, newest first
  filtered.sort(function(a,b){return(b.createdAt||'').localeCompare(a.createdAt||'');});
  var root = document.getElementById('root');
  var counts = {all:allTrips.length,draft:0,researching:0,complete:0};
  allTrips.forEach(function(t){counts[t.status]=(counts[t.status]||0)+1;});

  var h = '<div class="header"><h1>My Trips</h1><button class="btn-primary" onclick="sendMessage(\\'Create a new trip\\')">+ New Trip</button></div>';
  h += '<div class="filters">';
  ['all','draft','researching','complete'].forEach(function(f){
    h+='<button class="filter-btn'+(currentFilter===f?' active':'')+'" onclick="setFilter(\\''+f+'\\')">'+f.charAt(0).toUpperCase()+f.slice(1)+' <span class="count-badge">'+counts[f]+'</span></button>';
  });
  h += '</div>';

  if (!filtered.length) {
    h += '<div class="empty-state"><p class="muted text-sm">'+(allTrips.length?'No trips match this filter.':'No trips yet.')+'</p>';
    if(!allTrips.length)h+='<button class="btn-primary mt-4" onclick="sendMessage(\\'Plan a trip\\')">Plan a Trip</button>';
    h+='</div>';
  } else {
    h += '<div class="results-table-wrap"><table><thead><tr>';
    h += '<th>Name</th><th>Route</th><th>Dates</th><th>Class</th><th>Status</th><th>Best Price</th><th>Results</th><th>Created</th>';
    h += '</tr></thead><tbody>';
    filtered.forEach(function(t){
      var bestPrice=(t.results&&t.results.length)?Math.min.apply(null,t.results.map(function(r){return r.price;})):null;
      var resultCount=(t.results||[]).length;
      var totalResults=t._totalResults||resultCount;
      var isLive=t.workerRunning||t.status==='researching';
      var tasks=t.searchTasks||[];
      var dn=tasks.filter(function(x){return x.status==='done';}).length;
      var created=t.createdAt?new Date(t.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';

      h+='<tr style="cursor:pointer" onclick="openTrip(\\''+t.id+'\\')">';
      h+='<td class="font-medium">'+t.name+'</td>';
      h+='<td class="text-sm">'+t.origin+' → '+t.destinations.join(', ')+(t.returnOrigins&&t.returnOrigins.length?' <span class="muted">ret '+t.returnOrigins.join(', ')+'</span>':'')+'</td>';
      h+='<td class="text-sm">'+fmtD(t.earliestDeparture)+' – '+fmtD(t.latestReturn)+'</td>';
      h+='<td class="text-sm">'+t.seatClass+'</td>';
      h+='<td>';
      if(isLive)h+='<span class="live-badge"><span class="live-dot"></span>'+dn+'/'+tasks.length+'</span>';
      else h+='<span class="badge badge-'+t.status+'">'+t.status+'</span>';
      h+='</td>';
      h+='<td class="font-semibold">'+(bestPrice?fmtPrice(bestPrice,getCurrency(t)):'–')+'</td>';
      h+='<td class="text-sm">'+(totalResults||'–')+'</td>';
      h+='<td class="text-sm muted">'+created+'</td>';
      h+='</tr>';
    });
    h += '</tbody></table></div>';
  }
  root.innerHTML = h;
}

var API_BASE = '${API_BASE}';

function setFilter(f){currentFilter=f;renderList();}
function openTrip(id){currentView='detail';detailTripId=id;renderDetail();startPoll();}
function goBack(){currentView='list';detailTripId=null;stopPoll();refreshList();}

// ===== DETAIL VIEW — ONE UNIFIED LIST =====
function renderDetail() {
  var trip=getTrip(detailTripId);
  if(!trip){goBack();return;}
  var root=document.getElementById('root');
  var results=trip.results||[];
  var tasks=trip.searchTasks||[];
  var isLive=trip.workerRunning||trip.status==='researching';
  var cur=getCurrency(trip);

  // Progress stats
  var dn=tasks.filter(function(t){return t.status==='done';}).length;
  var er=tasks.filter(function(t){return t.status==='error';}).length;
  var rn=tasks.filter(function(t){return t.status==='running';}).length;
  var tot=tasks.length, pct=tot?Math.round(((dn+er)/tot)*100):0;

  var h='<button class="back-btn" onclick="goBack()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back</button>';

  // Banner
  h+='<div class="trip-banner"><h1>'+trip.name+'</h1>';
  h+='<div class="route"><span class="code">'+trip.origin+'</span><span style="opacity:0.5">→</span><span class="code">'+trip.destinations.join(', ')+'</span>';
  h+='<span class="badge badge-'+trip.status+'" style="margin-left:12px">'+trip.status+'</span></div>';
  h+='<div class="meta"><span>'+fmtD(trip.earliestDeparture)+' – '+fmtD(trip.latestReturn)+'</span>';
  h+='<span>'+trip.tripLengthDays.min+'–'+trip.tripLengthDays.max+' days</span>';
  h+='<span>'+trip.passengers+' pax · '+trip.seatClass+'</span>';
  if(results.length){var bp=Math.min.apply(null,results.map(function(r){return r.price;}));h+='<span style="color:#4ade80;font-weight:700">Best: '+fmtPrice(bp,cur)+'</span>';}
  if(tot)h+='<span>'+dn+'/'+tot+' searches</span>';
  h+='</div></div>';

  // Action bar + progress
  h+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">';
  var hasPending=tasks.some(function(t){return t.status==='pending'||t.status==='error';});
  if(!isLive&&hasPending)h+='<button class="btn-primary" onclick="sendMessage(\\'Execute research for trip '+trip.id+'\\')">▶ Resume Research</button>';
  else if(!isLive&&!hasPending&&tot===0&&trip.searchPlan)h+='<button class="btn-primary" onclick="sendMessage(\\'Execute research for trip '+trip.id+'\\')">▶ Start Research</button>';
  if(isLive)h+='<button class="btn-ghost" style="color:#dc2626" onclick="sendMessage(\\'Stop research for trip '+trip.id+'\\')">■ Stop</button>';
  if(tot){
    if(isLive)h+='<span class="live-badge"><span class="live-dot"></span>LIVE</span>';
    h+='<div class="progress-bar" style="flex:1;max-width:200px"><div class="progress-fill '+(isLive?'active':'done')+'" style="width:'+pct+'%"></div></div>';
    h+='<span class="text-xs muted">'+dn+'/'+tot+(er?' · '+er+' err':'')+'</span>';
  }
  h+='</div>';

  // Prefs
  var p=trip.preferences||{},prefs=[];
  if(p.maxStops!==undefined)prefs.push('Max '+p.maxStops+' stops');
  if(p.maxLayoverHours)prefs.push('Layover <'+p.maxLayoverHours+'h');
  if(p.maxPrice)prefs.push('Budget '+fmtPrice(p.maxPrice,cur));
  if(p.preferredAirports&&p.preferredAirports.length)prefs.push('Prefer: '+p.preferredAirports.join(', '));
  if(p.preferredAirlines&&p.preferredAirlines.length)prefs.push('Airlines: '+p.preferredAirlines.join(', '));
  if(p.avoidAirlines&&p.avoidAirlines.length)prefs.push('Avoid: '+p.avoidAirlines.join(', '));
  if(p.currency)prefs.push('Currency: '+p.currency);
  if(prefs.length){h+='<div class="prefs-grid">';prefs.forEach(function(pr){h+='<div class="pref-chip">'+pr+'</div>';});h+='</div>';}

  // === ONE TABLE: results + pending tasks, top 3 highlighted, sorted by price ===
  if(results.length>0||tasks.length>0){
    var sorted=results.slice().sort(function(a,b){
      var va,vb;
      if(sortField==='price'){va=a.price;vb=b.price;}
      else if(sortField==='duration'){va=a.totalDurationMinutes;vb=b.totalDurationMinutes;}
      else if(sortField==='stops'){va=a.stops;vb=b.stops;}
      else if(sortField==='date'){va=a.searchSpec?.departDate||'';vb=b.searchSpec?.departDate||'';}
      else{va=a.price;vb=b.price;} // default = price
      if(va<vb)return sortAsc?-1:1;
      if(va>vb)return sortAsc?1:-1;
      return 0;
    });
    // Mark top 3 in sorted order
    var top3Ids={};
    sorted.slice(0,3).forEach(function(r,i){top3Ids[r.rank]=i+1;});

    // Pending/running/error tasks not in results
    var doneKeys={};
    results.forEach(function(r){if(r.searchSpec)doneKeys[r.searchSpec.departDate+r.searchSpec.to+r.searchSpec.returnDate]=true;});
    var activeTasks=tasks.filter(function(t){return t.status==='running'||t.status==='error';});
    var pendingTasks=tasks.filter(function(t){return t.status==='pending';});

    var totalLabel=trip._totalResults&&trip._totalResults>results.length?trip._totalResults+' total, showing '+results.length:''+results.length;
    h+='<div class="section-title">Results ('+totalLabel+')'+(pendingTasks.length?' · '+pendingTasks.length+' pending':'')+(activeTasks.length?' · '+activeTasks.length+' active':'')+'</div>';
    h+='<div class="results-table-wrap"><table><thead><tr>';
    h+='<th style="width:30px"></th>';
    h+='<th><button class="sort-btn'+(sortField==='price'?' active':'')+'" onclick="setSort(\\'price\\')">Price ↕</button></th>';
    h+='<th><button class="sort-btn'+(sortField==='date'?' active':'')+'" onclick="setSort(\\'date\\')">Date ↕</button></th>';
    h+='<th>Route</th><th>Airlines</th><th>Times</th>';
    h+='<th><button class="sort-btn'+(sortField==='duration'?' active':'')+'" onclick="setSort(\\'duration\\')">Dur ↕</button></th>';
    h+='<th><button class="sort-btn'+(sortField==='stops'?' active':'')+'" onclick="setSort(\\'stops\\')">Stops ↕</button></th>';
    h+='<th style="width:40px"></th>';
    h+='</tr></thead><tbody>';

    // Render running/error tasks at top
    function renderTaskRow(t){
      var cls=t.status==='running'?'style="background:#eff6ff"':t.status==='error'?'style="background:#fef2f2"':'style="opacity:0.35"';
      h+='<tr '+cls+'>';
      h+='<td>'+taskIcon(t.status)+'</td>';
      h+='<td class="text-sm muted">'+(t.status==='running'?'searching…':t.status==='error'?'<span style="color:#dc2626">error</span>':'pending')+'</td>';
      h+='<td class="text-sm">'+fmtD(t.spec.departDate)+' – '+fmtD(t.spec.returnDate)+'</td>';
      h+='<td class="text-sm">'+t.spec.from+' → '+t.spec.to+(t.spec.returnFrom?' ret '+t.spec.returnFrom:'')+'</td>';
      h+='<td colspan="4" class="text-sm muted">'+(t.status==='error'?(t.error||'').slice(0,40):'')+'</td>';
      h+='<td>'+(t.googleFlightsUrl?'<button class="btn-ghost" style="padding:1px 4px;font-size:10px;color:#2563eb" onclick="event.stopPropagation();copyUrl(\\''+t.googleFlightsUrl+'\\')">GF↗</button>':'')+'</td>';
      h+='</tr>';
    }
    activeTasks.forEach(renderTaskRow);

    // Render results
    sorted.slice(0,50).forEach(function(r,idx){
      var legs=r.flights||[],f=legs[0]||{},l=legs[legs.length-1]||{};
      var allAir=[]; legs.forEach(function(lg){if(allAir.indexOf(lg.airline)===-1)allAir.push(lg.airline);});
      var gfUrl2='';
      tasks.forEach(function(t2){if(t2.spec.departDate===r.searchSpec?.departDate&&t2.spec.to===r.searchSpec?.to&&t2.spec.returnDate===r.searchSpec?.returnDate&&t2.googleFlightsUrl)gfUrl2=t2.googleFlightsUrl;});
      var isTop=top3Ids[r.rank]!==undefined;
      var topN=top3Ids[r.rank];
      var rowStyle=isTop?'style="background:'+(topN===1?'#fffbeb;border-left:3px solid #f59e0b':topN===2?'#f8fafc;border-left:3px solid #94a3b8':'#fff7ed;border-left:3px solid #f97316')+'"':'';
      h+='<tr '+rowStyle+'>';
      h+='<td>'+(isTop?'<span class="rank-badge rank-'+topN+'">'+topN+'</span>':'')+'</td>';
      h+='<td class="font-semibold'+(isTop?' text-lg':'')+'">'+fmtPrice(r.price,r.currency)+'</td>';
      h+='<td class="text-sm">'+fmtD(r.searchSpec?.departDate)+' – '+fmtD(r.searchSpec?.returnDate)+'</td>';
      h+='<td class="text-sm font-medium">'+(f.departure?.airport||'')+' → '+(l.arrival?.airport||'')+(r.searchSpec?.returnFrom?' <span class="muted">ret '+r.searchSpec.returnFrom+'</span>':'')+'</td>';
      h+='<td class="text-sm">'+allAir.join(', ')+'</td>';
      h+='<td class="text-sm">'+fmt(f.departure?.time)+' – '+fmt(l.arrival?.time)+'</td>';
      h+='<td class="text-sm">'+fmtDur(r.totalDurationMinutes)+'</td>';
      h+='<td class="text-sm">'+nStops(r.stops)+'</td>';
      h+='<td>'+(gfUrl2?'<button class="btn-ghost" style="padding:1px 4px;font-size:10px;color:#2563eb" onclick="event.stopPropagation();copyUrl(\\''+gfUrl2+'\\')">GF↗</button>':'')+'</td>';
      h+='</tr>';
    });
    // Pending tasks at the bottom
    pendingTasks.forEach(renderTaskRow);

    h+='</tbody></table></div>';
  } else if(trip.searchPlan) {
    h+='<div class="card p-4" style="text-align:center"><p class="font-semibold">'+trip.searchPlan.searches.length+' searches planned</p></div>';
  }

  root.innerHTML=h;
}

function setSort(f){if(sortField===f)sortAsc=!sortAsc;else{sortField=f;sortAsc=true;}renderDetail();}

// ===== POLLING via direct REST fetch =====
function refreshList() {
  fetch(API_BASE + '/api/trips').then(function(r){return r.json();}).then(function(data){
    if(data&&data.trips){allTrips=data.trips;if(currentView==='list')renderList();else renderDetail();}
  }).catch(function(){});
}
function refreshTrip(id) {
  fetch(API_BASE + '/api/trips/' + id).then(function(r){return r.json();}).then(function(data){
    if(data&&data.trip){
      var t=data.trip;t.workerRunning=!!data.workerRunning;
      var idx=allTrips.findIndex(function(x){return x.id===t.id;});
      if(idx>=0)allTrips[idx]=t;else allTrips.unshift(t);
      if(currentView==='detail'&&detailTripId===t.id)renderDetail();
    }
  }).catch(function(){});
}
function startPoll() {
  if(_pollTimer)return;
  _pollTimer=setInterval(function(){
    if(currentView==='detail'&&detailTripId){
      refreshTrip(detailTripId);
    } else {
      refreshList();
    }
    var anyLive=allTrips.some(function(t){return t.workerRunning||t.status==='researching';});
    if(!anyLive)stopPoll();
  }, 2000);
}
function stopPoll(){if(_pollTimer){clearInterval(_pollTimer);_pollTimer=null;}}

// ===== ENTRY =====
function onToolResult(result) {
  var data = result?.structuredContent || result;
  // TRIP_LIST response — array of full trips
  if (data?.trips) {
    allTrips = data.trips;
    if(currentView==='list')renderList();
    else renderDetail();
    var anyLive=allTrips.some(function(t){return t.workerRunning||t.status==='researching';});
    if(anyLive)startPoll();
    return;
  }
  // TRIP_GET / TRIP_EXECUTE response — single trip, merge into list
  if (data?.trip) {
    var t=data.trip;
    t.workerRunning=!!data.workerRunning;
    var idx=allTrips.findIndex(function(x){return x.id===t.id;});
    if(idx>=0)allTrips[idx]=t;else allTrips.unshift(t);
    currentView='detail';
    detailTripId=t.id;
    renderDetail();
    if(t.workerRunning||t.status==='researching')startPoll();
    return;
  }
  // No data from tool result — fetch from REST API directly
  refreshList();
}
</script></body></html>`;
}
