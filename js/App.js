function App(){
  const [sheets,setSheets] = useState([]); // [{id, fileName, dateType, rows}]
  const [activeId,setActiveId] = useState(null);
  const [loaded,setLoaded] = useState(false);
  const [search,setSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState('all');
  const [squadFilter,setSquadFilter] = useState('all');
  const [pctFilter,setPctFilter] = useState('all');
  const [pctExact,setPctExact] = useState('');
  const [view,setView] = useState('assignments');
  const [copyMsg,setCopyMsg] = useState('');
  const [authUser,setAuthUser] = useState(null);
  const [showLogin,setShowLogin] = useState(true);
  const fileRef = useRef();

  const activeSheet = sheets.find(s=>s.id===activeId) || null;
  const rows = activeSheet ? activeSheet.rows : [];
  const dateType = activeSheet ? activeSheet.dateType : 'none';
  const fileName = activeSheet ? activeSheet.fileName : '';

  const STATUS_META = dateType==='due' ? STATUS_META_DUE : STATUS_META_ACTIVITY;
  const dateColLabel = dateType==='due' ? 'End Date' : (dateType==='activity' ? 'Last Active' : '—');

  useEffect(()=>{
    try{
      const raw = localStorage.getItem('lu-sheets');
      if(raw){
        const parsed = JSON.parse(raw);
        const loadedSheets = parsed.sheets || [];
        setSheets(loadedSheets);
        setActiveId(parsed.activeId && loadedSheets.some(s=>s.id===parsed.activeId) ? parsed.activeId : (loadedSheets[0] ? loadedSheets[0].id : null));
      }
    }catch(e){ /* no data yet */ }
    setLoaded(true);
  },[]);

  // Real auth session, backed by Supabase (see js/config.js).
  useEffect(()=>{
    if(!supabaseReady) return;
    supabaseClient.auth.getSession().then(({data})=>{
      if(data.session){
        setAuthUser(data.session.user);
        setShowLogin(false);
      }
    });
    const {data: sub} = supabaseClient.auth.onAuthStateChange((_event, session)=>{
      setAuthUser(session ? session.user : null);
      setShowLogin(!session);
    });
    return ()=> sub.subscription.unsubscribe();
  },[]);

  function persist(newSheets, newActiveId){
    try{
      localStorage.setItem('lu-sheets', JSON.stringify({sheets:newSheets, activeId:newActiveId}));
    }catch(e){ console.error('storage failed', e); }
  }

  function onSignedIn(user){
    setAuthUser(user);
    setShowLogin(false);
  }
  async function signOut(){
    if(supabaseReady) await supabaseClient.auth.signOut();
    setAuthUser(null);
    setShowLogin(true);
  }

  function parseSheetFromWorkbook(json){
    const sample = json[0] || {};
    const dueKeyProbe = pickKey(sample,['enddate','duedate','deadline','targetdate','completionduedate']);
    const activityKeyProbe = pickKey(sample,['lastupdated','lastactivity','lastactive','updatedat','modifieddate']);
    const dateType = dueKeyProbe ? 'due' : (activityKeyProbe ? 'activity' : 'none');

    const parsedRows = json.map(r=>{
      const gmailKey = pickKey(r,['gmail','email','emailaddress','gmailid','studentemail','useremail']);
      const nameKey = pickKey(r,['name','fullname','employeename','studentname','username']);
      const luKey = pickKey(r,['luname','lu','learningunit','course','coursename','subjecttitle','courseslug','subjectname']);
      const pctKey = pickKey(r,['lucompletionpercentage','completion','completionpercentage','percentcomplete','progress','progresspercentage']);
      const dateKey = dueKeyProbe || activityKeyProbe;
      const squadKey = pickKey(r,['squadnumber','squad','batch','cohort','section']);
      const campusKey = pickKey(r,['campusname','campus','university','college']);
      let pctRaw = pctKey ? r[pctKey] : 0;
      if(typeof pctRaw==='string') pctRaw = parseFloat(pctRaw.replace('%',''))||0;
      if(pctRaw<=1 && pctRaw>0) pctRaw = pctRaw*100; // handle 0-1 fractions
      const dateRaw = dateKey ? r[dateKey] : null;
      const dateVal = excelDateToJS(dateRaw);
      return {
        gmail: gmailKey ? String(r[gmailKey]).trim() : '',
        name: nameKey ? String(r[nameKey]).trim() : '',
        lu: luKey ? String(r[luKey]).trim() : '',
        pct: Math.max(0, Math.min(100, Math.round(pctRaw))),
        date: dateVal ? dateVal.toISOString() : null,
        squad: squadKey ? String(r[squadKey]).trim() : '',
        campus: campusKey ? String(r[campusKey]).trim() : '',
      };
    }).filter(r=>r.name || r.gmail);

    return {rows: parsedRows, dateType};
  }

  function readFileAsync(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = (evt)=>{
        try{
          const wb = XLSX.read(evt.target.result, {type:'array', cellDates:false});
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, {defval:''});
          resolve({file, json});
        }catch(err){ reject(err); }
      };
      reader.onerror = ()=> reject(new Error('read failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFile(e){
    const files = Array.from(e.target.files || []);
    if(files.length===0) return;
    const newSheets = [];
    const errors = [];
    for(const file of files){
      try{
        const {json} = await readFileAsync(file);
        if(json.length===0){ errors.push(`${file.name}: no rows found.`); continue; }
        const {rows: parsedRows, dateType} = parseSheetFromWorkbook(json);
        if(parsedRows.length===0){ errors.push(`${file.name}: no Name/Email column found.`); continue; }
        newSheets.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          fileName: file.name,
          dateType,
          rows: parsedRows,
        });
      }catch(err){
        console.error(err);
        errors.push(`${file.name}: couldn't be read.`);
      }
    }
    if(errors.length) alert(errors.join('\n'));
    if(newSheets.length){
      const combined = [...sheets, ...newSheets];
      const newActive = newSheets[0].id;
      setSheets(combined);
      setActiveId(newActive);
      persist(combined, newActive);
    }
    e.target.value = '';
  }

  function closeSheet(id, evt){
    evt.stopPropagation();
    const combined = sheets.filter(s=>s.id!==id);
    const newActive = activeId===id ? (combined[0] ? combined[0].id : null) : activeId;
    setSheets(combined);
    setActiveId(newActive);
    persist(combined, newActive);
  }

  // ---- Email reminder helpers ----
  // No backend/email service is wired up here, so "sending" opens the person's own
  // email client (via mailto:) pre-filled, or copies the address list to paste into one.
  function personalMailto(r){
    const subject = `Reminder: finish "${r.lu || 'your LU'}"`;
    const pctLine = `You're currently at ${r.pct}% completion.`;
    const dateLine = r.date ? (dateType==='due'
      ? `This is due by ${fmtDate(r.date)}.`
      : `Your last recorded activity was ${fmtDate(r.date)}.`) : '';
    const body = `Hi ${r.name || 'there'},\n\n${pctLine} ${dateLine}\n\nPlease finish it up when you get a chance.\n\nThanks!`;
    return `mailto:${encodeURIComponent(r.gmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const incomplete = useMemo(()=> rows.filter(r=> statusOf(r.pct,r.date,dateType)!=='complete' && r.gmail),[rows,dateType]);

  function notifyAllIncomplete(){
    if(incomplete.length===0) return;
    const emails = Array.from(new Set(incomplete.map(r=>r.gmail)));
    const subject = 'Reminder: please complete your LU';
    const body = "Hi,\n\nThis is a reminder to finish your pending Learning Unit. Please complete it as soon as you can.\n\nThanks!";
    const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if(mailto.length>1800){
      copyEmails();
      alert(`That's ${emails.length} recipients — too many for a mailto link to handle reliably, so the list has been copied to your clipboard instead. Paste it into the BCC field of a new email in Gmail/Outlook.`);
    }else{
      window.location.href = mailto;
    }
  }

  async function copyEmails(){
    const emails = Array.from(new Set(incomplete.map(r=>r.gmail)));
    const text = emails.join(', ');
    try{
      await navigator.clipboard.writeText(text);
      setCopyMsg(`Copied ${emails.length} email${emails.length===1?'':'s'} to clipboard`);
    }catch(e){
      window.prompt('Copy this list manually (Ctrl/Cmd+C):', text);
    }
    setTimeout(()=>setCopyMsg(''), 3000);
  }

  const squads = useMemo(()=>{
    const s = new Set(rows.map(r=>r.squad).filter(Boolean));
    return Array.from(s).sort();
  },[rows]);

  const filtered = useMemo(()=>{
    const threshold = pctExact==='' ? null : Math.max(0, Math.min(100, Number(pctExact)));
    return rows.filter(r=>{
      const st = statusOf(r.pct, r.date, dateType);
      if(statusFilter!=='all' && st!==statusFilter) return false;
      if(squadFilter!=='all' && r.squad!==squadFilter) return false;
      if(threshold!==null && r.pct>=threshold) return false;
      if(search){
        const q = search.toLowerCase();
        if(!(r.name.toLowerCase().includes(q) || r.gmail.toLowerCase().includes(q) || r.lu.toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a,b)=> b.pct - a.pct || a.name.localeCompare(b.name, undefined, {sensitivity:'base'}));
  },[rows,search,statusFilter,squadFilter,pctExact,dateType]);

  const stats = useMemo(()=>{
    const total = rows.length;
    const people = new Set(rows.map(r=>r.gmail||r.name)).size;
    const avg = total ? Math.round(rows.reduce((a,r)=>a+r.pct,0)/total) : 0;
    const counts = {complete:0, ontrack:0, due:0, overdue:0, notstarted:0};
    rows.forEach(r=> counts[statusOf(r.pct,r.date,dateType)]++ );
    return {total, people, avg, counts};
  },[rows,dateType]);

  const byPerson = useMemo(()=>{
    const map = {};
    filtered.forEach(r=>{
      const key = r.gmail || r.name;
      if(!map[key]) map[key] = {name:r.name, gmail:r.gmail, squad:r.squad, items:[]};
      map[key].items.push(r);
    });
    return Object.values(map)
      .map(p=>({...p, _avg: p.items.reduce((a,x)=>a+x.pct,0)/p.items.length}))
      .sort((a,b)=> b._avg - a._avg || a.name.localeCompare(b.name, undefined, {sensitivity:'base'}));
  },[filtered]);

  const donutStyle = useMemo(()=>{
    const c = stats.counts;
    const total = stats.total || 1;
    const segs = [
      {k:'complete', v:c.complete, color:'#141414'},
      {k:'ontrack', v:c.ontrack, color:'#5C5C5C'},
      {k:'due', v:c.due, color:'#D6373F'},
      {k:'overdue', v:c.overdue, color:'#A6001B'},
      {k:'notstarted', v:c.notstarted, color:'#8C8C8C'},
    ];
    let acc = 0;
    const stops = segs.map(s=>{
      const start = (acc/total)*360;
      acc += s.v;
      const end = (acc/total)*360;
      return `${s.color} ${start}deg ${end}deg`;
    }).join(', ');
    return {background: total? `conic-gradient(${stops})` : 'var(--line)'};
  },[stats]);

  if(!loaded) return null;

  if(showLogin){
    return <AuthModal onSignedIn={onSignedIn} onClose={()=>setShowLogin(false)} page />;
  }

  return (
    <div className="wrap">
      <div className="signin-corner">
        {authUser ? (
          <>
            <span className="account-id">{authUser.email}</span>
            <button className="logout-btn" onClick={signOut}>Log out</button>
          </>
        ) : (
          <button className="signin-btn" onClick={()=>setShowLogin(true)}>Sign in</button>
        )}
      </div>
      {showLogin && <AuthModal onSignedIn={onSignedIn} onClose={()=>setShowLogin(false)} />}

      <div className="hero">
        <div>
          <h1>LU Completion Tracker</h1>
          <p className="sub">Upload one or more roster exports with name, email, LU/subject, completion % and a date column — each file gets its own tab, auto-mapped and tracked separately.</p>
        </div>
        <div className="upload-row">
          <button className="upload-btn" onClick={()=>fileRef.current.click()}>
            Add file(s)
          </button>
          <input ref={fileRef} type="file" multiple onChange={handleFile} />
          {fileName && <span className="upload-hint">{fileName} · {rows.length} rows</span>}
        </div>

      </div>

      {sheets.length>1 && (
        <div className="tab-bar">
          {sheets.map(s=>(
            <button key={s.id} className={"tab"+(s.id===activeId?' active':'')} onClick={()=>setActiveId(s.id)}>
              <span className="tab-name">{s.fileName}</span>
              <span className="tab-count">{s.rows.length}</span>
              <span className="tab-close" onClick={(evt)=>closeSheet(s.id, evt)}>×</span>
            </button>
          ))}
        </div>
      )}

      {rows.length===0 ? (
        <div className="empty">
          <b>No roster loaded yet.</b><br/>
          Upload a sheet with columns like these — headers can vary, they're auto-detected.
          <div className="cols">Name · Email · LU / Subject · Completion % · End Date (or Last Updated)</div>
        </div>
      ) : (
        <>
          <div className="stat-band">
            <div className="donut-cell">
              <div style={{width:64,height:64,borderRadius:'50%',...donutStyle}}></div>
              <div className="donut-legend">
                <span><span className="dot" style={{background:'#141414'}}></span>Complete {stats.counts.complete}</span>
                <span><span className="dot" style={{background:'#5C5C5C'}}></span>On track {stats.counts.ontrack}</span>
                <span><span className="dot" style={{background:'#D6373F'}}></span>{STATUS_META.due.label} {stats.counts.due}</span>
                <span><span className="dot" style={{background:'#A6001B'}}></span>{STATUS_META.overdue.label} {stats.counts.overdue}</span>
                <span><span className="dot" style={{background:'#8C8C8C'}}></span>Not started {stats.counts.notstarted}</span>
              </div>
            </div>
            <div className="stat-cell"><div className="num">{stats.people}</div><div className="lbl">Folks tracked</div></div>
            <div className="stat-cell"><div className="num">{stats.total}</div><div className="lbl">LU assignments</div></div>
            <div className="stat-cell"><div className="num">{stats.avg}%</div><div className="lbl">Avg completion</div></div>
            <div className="stat-cell"><div className="num" style={{color:'var(--rust)'}}>{stats.counts.overdue}</div><div className="lbl">{STATUS_META.overdue.label}</div></div>
          </div>

          <div className="notify-bar">
            <span className="notify-info">
              <b>{incomplete.length}</b> {incomplete.length===1?'person hasn\'t':'folks haven\'t'} finished in this roster
            </span>
            <button className="notify-btn" onClick={notifyAllIncomplete} disabled={incomplete.length===0}>
              Email everyone incomplete
            </button>
            <button className="notify-btn ghost" onClick={copyEmails} disabled={incomplete.length===0}>
              Copy their emails
            </button>
            {copyMsg && <span className="copy-msg">{copyMsg}</span>}
          </div>

          <div className="controls">
            <input type="text" placeholder="Search name, gmail or LU…" value={search} onChange={e=>setSearch(e.target.value)} />
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="complete">Complete</option>
              <option value="ontrack">On track</option>
              <option value="due">{STATUS_META.due.label}</option>
              <option value="overdue">{STATUS_META.overdue.label}</option>
              <option value="notstarted">Not started</option>
            </select>
            <div className="pct-range">
              <input type="number" min="0" max="100" placeholder="Below %…" value={pctExact}
                onChange={e=>setPctExact(e.target.value)} />
              {pctExact!=='' && (
                <button className="pct-clear" onClick={()=>setPctExact('')} title="Clear percentage filter">×</button>
              )}
            </div>
            {squads.length>0 && (
              <select value={squadFilter} onChange={e=>setSquadFilter(e.target.value)}>
                <option value="all">All squads</option>
                {squads.map(s=> <option key={s} value={s}>Squad {s}</option>)}
              </select>
            )}
            <div className="view-toggle">
              <button className={view==='assignments'?'active':''} onClick={()=>setView('assignments')}>By assignment</button>
              <button className={view==='people'?'active':''} onClick={()=>setView('people')}>By person</button>
            </div>
          </div>

          {view==='assignments' ? (
            <table>
              <thead>
                <tr><th>Folk</th><th>LU</th><th>Completion</th><th>{dateColLabel}</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((r,i)=>{
                  const st = statusOf(r.pct, r.date, dateType);
                  return (
                    <tr key={i}>
                      <td className="name-cell"><span className="nm">{r.name||'—'}</span><span className="em">{r.gmail}{r.squad && ` · Sq ${r.squad}`}</span></td>
                      <td><span className="lu-tag">{r.lu||'—'}</span></td>
                      <td>
                        <span className="bar-track"><span className="bar-fill" style={{width:r.pct+'%',background:barColor(r.pct)}}></span></span>
                        <span className="pct">{r.pct}%</span>
                      </td>
                      <td className="end-date">{fmtDate(r.date)}</td>
                      <td><span className={"badge "+st}>{STATUS_META[st].label}</span></td>
                      <td>
                        {st!=='complete' && r.gmail && (
                          <a className="row-notify" href={personalMailto(r)} title={`Email ${r.name||r.gmail}`}>✉</a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div>
              {byPerson.map((p,i)=>{
                const avg = Math.round(p.items.reduce((a,x)=>a+x.pct,0)/p.items.length);
                const anyIncomplete = p.items.some(r=> statusOf(r.pct,r.date,dateType)!=='complete');
                return (
                  <div className="person-card" key={i}>
                    <div className="person-head">
                      <div><span className="nm">{p.name||'—'}</span><br/><span className="em">{p.gmail}{p.squad && ` · Sq ${p.squad}`}</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span className="pct">avg {avg}%</span>
                        {anyIncomplete && p.gmail && (
                          <a className="row-notify" href={personalMailto(p.items.find(r=>statusOf(r.pct,r.date,dateType)!=='complete'))} title={`Email ${p.name||p.gmail}`}>✉</a>
                        )}
                      </div>
                    </div>
                    <div className="person-lus">
                      {p.items.map((r,j)=>{
                        const st = statusOf(r.pct, r.date, dateType);
                        return (
                          <div className="mini-lu" key={j} style={{borderColor:STATUS_META[st].color}}>
                            <div className="lun">{r.lu||'—'}</div>
                            <div className="row2"><span>{r.pct}%</span><span>{fmtDate(r.date)}</span></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="footer-note">Data stays on your account · re-upload anytime to refresh the roster</div>
        </>
      )}
    </div>
  );
}

