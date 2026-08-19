const {useState,useEffect,useMemo,useRef} = React;

// dateType 'due' = a real deadline column was found (End Date / Due Date).
// dateType 'activity' = only a last-updated/last-activity timestamp was found — no deadline exists,
// so status is inferred from completion tiers plus how stale the activity is.
function statusOf(pct, dateVal, dateType){
  if(pct>=100) return 'complete';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = dateVal ? new Date(dateVal) : null;
  const validDate = d && !isNaN(d);
  if(dateType==='due' && validDate){
    d.setHours(0,0,0,0);
    const diffDays = (d-today)/86400000;
    if(diffDays<0) return 'overdue';
    if(diffDays<=7) return 'due';
    return 'ontrack';
  }
  // activity-based (or no date at all)
  const daysSinceUpdate = validDate ? (today-d)/86400000 : null;
  const stale = daysSinceUpdate!==null && daysSinceUpdate>7;
  if(pct===0) return stale ? 'overdue' : 'notstarted';
  if(stale) return 'overdue';
  if(pct<50) return 'due';
  return 'ontrack';
}
const STATUS_META_DUE = {
  complete:{label:'Complete',color:'var(--teal)'},
  ontrack:{label:'On Track',color:'#5C5C5C'},
  due:{label:'Due Soon',color:'var(--amber)'},
  overdue:{label:'Overdue',color:'var(--rust)'},
  notstarted:{label:'Not Started',color:'var(--rust)'},
};
const STATUS_META_ACTIVITY = {
  complete:{label:'Complete',color:'var(--teal)'},
  ontrack:{label:'On Track',color:'#5C5C5C'},
  due:{label:'Behind Pace',color:'var(--amber)'},
  overdue:{label:'Inactive 7d+',color:'var(--rust)'},
  notstarted:{label:'Not Started',color:'var(--rust)'},
};
function barColor(pct){
  if(pct>=100) return 'var(--teal)';
  if(pct>=60) return '#5C5C5C';
  if(pct>=30) return 'var(--amber)';
  return 'var(--rust)';
}
function fmtDate(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d)) return String(v);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function excelDateToJS(v){
  if(v==null || v==='') return null;
  if(typeof v==='number'){
    // Excel serial date
    const utc = XLSX.SSF.parse_date_code(v);
    if(utc) return new Date(utc.y, utc.m-1, utc.d);
  }
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function pickKey(row, candidates){
  const keys = Object.keys(row);
  for(const c of candidates){
    const found = keys.find(k=>k.toLowerCase().replace(/[^a-z0-9]/g,'')===c);
    if(found) return found;
  }
  return null;
}

