const DASHBOARD_SUBJECTS = [
  'Discrete Mathematics',
  'Innovation and Design Thinking',
  'UI and UX Design for Computer Science Engineering',
  'Computer Organisation and Architecture',
  'Operating Systems',
  'Environmental Sciences',
  'Introduction to Artificial Intelligence',
];

function normalizeSubjectName(value){
  return String(value || '').trim().replace(/^#\s*/, '').toLowerCase();
}

function squadForRow(row){
  if(String(row.squad || '').trim()) return String(row.squad).trim();
  const email = String(row.gmail || '').toLowerCase();
  const match = email.match(/(?:^|[^0-9])(138|139)(?:[^0-9]|$)/);
  return match ? match[1] : '';
}

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
  const [activeSection,setActiveSection] = useState('assignments');
  const [dashboardSubject,setDashboardSubject] = useState(null);
  const [dashboardMetric,setDashboardMetric] = useState(false);
  const [selectedSubject,setSelectedSubject] = useState('all');
  const [showSubjects,setShowSubjects] = useState(true);
  const [subjectSearch,setSubjectSearch] = useState('');
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

  const subjectNames = useMemo(()=>{
    return Array.from(new Set(rows.map(r=>r.lu || 'Unlabelled'))).sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
  },[rows]);
  const activeSubject = subjectNames.includes(selectedSubject) ? selectedSubject : 'all';
  const subjectRows = useMemo(()=>{
    if(activeSubject==='all') return rows;
    return rows.filter(r=>(r.lu || 'Unlabelled')===activeSubject);
  },[rows,activeSubject]);

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

  useEffect(()=>{
    localStorage.setItem('lu-theme', theme);
  },[theme]);

  useEffect(()=>{
    localStorage.setItem('lu-font-size', fontSize);
  },[fontSize]);

  function increaseFontSize(){
    setFontSize(fontSize==='normal' ? 'large' : (fontSize==='large' ? 'xlarge' : 'normal'));
  }

  function navigateTo(section){
    setActiveSection(section);
    if(section==='dashboard'){
      setDashboardSubject(null);
      setDashboardMetric(false);
    }
    if(section==='progress') setView('people');
    if(section==='assignments') setView('assignments');
  }

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
      const luKey = pickKey(r,['luname','lu','learningunit','course','coursename','subjecttitle','courseslug','subjectname','subject']);
      const pctKey = pickKey(r,['lucompletionpercentage','completion','completionpercentage','percentcomplete','progress','progresspercentage','completionpercent','percentage','percent']);
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
        squad: squadKey ? String(r[squadKey]).trim() : (()=>{
          const email = gmailKey ? String(r[gmailKey]).trim().toLowerCase() : '';
          const match = email.match(/(?:^|[^0-9])(138|139)(?:[^0-9]|$)/);
          return match ? match[1] : '';
        })(),
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
      setSelectedSubject('all');
      setSubjectSearch('');
      setShowSubjects(false);
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

  const DEFAULT_TEMPLATE = `Hi {{name}},\n\nThis is a reminder to finish your pending Learning Unit ({{lu}}).\n\nThanks!`;

  function reminderDraft(targetRows, withNote){
    const recipients = Array.from(new Set(targetRows.map(r=>r.gmail).filter(Boolean)));
    const first = targetRows[0] || {};
    const subject = 'Reminder: please complete your LU';
    const body = withNote
      ? `Hi,\n\nThis is a reminder to finish your pending Learning Unit. Please complete it as soon as you can.\n\nThanks!`
      : DEFAULT_TEMPLATE.replaceAll('{{name}}', first.name || 'there').replaceAll('{{lu}}', first.lu || 'your LU');
    return {recipients, subject, body};
  }

  function openDraftDirect(targetRows, withNote=true){
    const draft = reminderDraft(targetRows, withNote);
    launchMail(draft);
  }

  async function launchMail(draft){
    if(draft.recipients.length===0) return;

    const recipientList = draft.recipients.join(',');
    const gmailComposeUrl = new URL('https://mail.google.com/mail/');
    gmailComposeUrl.searchParams.set('view', 'cm');
    gmailComposeUrl.searchParams.set('fs', '1');
    gmailComposeUrl.searchParams.set('to', recipientList);
    gmailComposeUrl.searchParams.set('su', draft.subject);
    gmailComposeUrl.searchParams.set('body', draft.body);

    if(authUser?.email){
      gmailComposeUrl.searchParams.set('authuser', authUser.email);
    }

    if(gmailComposeUrl.toString().length>2000){
      copyEmails();
      alert('There are too many recipients for one Gmail compose link. The email list was copied to your clipboard.');
      return;
    }

    const newTab = window.open(gmailComposeUrl.toString(), '_blank', 'noopener,noreferrer');
    if(!newTab){
      window.location.href = gmailComposeUrl.toString();
    }
  }

  const incomplete = useMemo(()=> subjectRows.filter(r=> statusOf(r.pct,r.date,dateType)!=='complete' && r.gmail),[subjectRows,dateType]);

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
    const s = new Set(subjectRows.map(r=>r.squad).filter(Boolean));
    return Array.from(s).sort();
  },[subjectRows]);

  const filtered = useMemo(()=>{
    const threshold = pctExact==='' ? null : Math.max(0, Math.min(100, Number(pctExact)));
    return subjectRows.filter(r=>{
      const st = statusOf(r.pct, r.date, dateType);
      if(statusFilter!=='all' && st!==statusFilter) return false;
      if(squadFilter!=='all' && squadForRow(r)!==squadFilter) return false;
      if(threshold!==null && r.pct>=threshold) return false;
      if(search){
        const q = search.toLowerCase();
        if(!(r.name.toLowerCase().includes(q) || r.gmail.toLowerCase().includes(q) || r.lu.toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a,b)=> b.pct - a.pct || a.name.localeCompare(b.name, undefined, {sensitivity:'base'}));
  },[subjectRows,search,statusFilter,squadFilter,pctExact,dateType]);

  const stats = useMemo(()=>{
    const total = subjectRows.length;
    const people = new Set(subjectRows.map(r=>r.gmail||r.name)).size;
    const avg = total ? Math.round(subjectRows.reduce((a,r)=>a+r.pct,0)/total) : 0;
    const counts = {complete:0, ontrack:0, due:0, overdue:0, notstarted:0};
    subjectRows.forEach(r=> counts[statusOf(r.pct,r.date,dateType)]++ );
    return {total, people, avg, counts};
  },[subjectRows,dateType]);

  const dashboardSubjects = useMemo(()=>DASHBOARD_SUBJECTS.map(subject=>{
    const subjectItems = rows.filter(r=>normalizeSubjectName(r.lu)===normalizeSubjectName(subject));
    const students = Array.from(new Map(subjectItems.map(r=>[r.gmail || r.name || `${subject}-${subjectItems.indexOf(r)}`,r])).values());
    const average = students.length ? Math.round(students.reduce((total,row)=>total+row.pct,0)/students.length) : 0;
    const completed = students.filter(row=>statusOf(row.pct,row.date,dateType)==='complete');
    return {subject,students,average,completed,incomplete:students.filter(row=>statusOf(row.pct,row.date,dateType)!=='complete')};
  }),[subjectNames,rows,dateType]);

  const selectedDashboard = dashboardSubjects.find(item=>item.subject===dashboardSubject) || null;

  const byPerson = useMemo(()=>{
    const map = {};
    filtered.forEach(r=>{
      const subject = r.lu || 'Unlabelled';
      const key = `${r.gmail || r.name}::${subject}`;
      if(!map[key]) map[key] = {
        name:r.name,
        gmail:r.gmail,
        squad:r.squad,
        subject,
        items:[]
      };
      map[key].items.push(r);
    });
    return Object.values(map)
      .map(p=>({...p, _avg: p.items.reduce((a,x)=>a+x.pct,0)/p.items.length}))
      .sort((a,b)=>
        a.subject.localeCompare(b.subject, undefined, {sensitivity:'base'}) ||
        b._avg - a._avg ||
        a.name.localeCompare(b.name, undefined, {sensitivity:'base'})
      );
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

      {rows.length>0 && (
        <div className="subject-picker">
          <div className="subject-header">
            <div>
              <span className="subject-label">Services</span>
              <h2>Subjects</h2>
            </div>
            <button className="subject-toggle" onClick={()=>setShowSubjects(!showSubjects)} aria-expanded={showSubjects}>
              {showSubjects ? 'Hide list' : 'Show list'}
            </button>
          </div>

          {showSubjects && (
            <div className="subject-menu">
              <input className="subject-search" type="search" placeholder="Search subjects..." value={subjectSearch} onChange={e=>setSubjectSearch(e.target.value)} autoFocus />

              <div className="subject-grid">
                <button className={activeSubject==='all'?'active':''} onClick={()=>setSelectedSubject('all')}>
                  <div className="subject-card-title">
                    <span>All subjects</span>
                    <small>{rows.length}</small>
                  </div>
                  <div className="subject-card-meta">Overview</div>
                </button>

                {subjectNames.filter(subject=>subject.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject=>(
                  <button key={subject} className={activeSubject===subject?'active':''} onClick={()=>setSelectedSubject(subject)}>
                    <div className="subject-card-title">
                      <span>{subject}</span>
                      <small>{rows.filter(r=>(r.lu || 'Unlabelled')===subject).length}</small>
                    </div>
                    <div className="subject-card-meta">{rows.filter(r=>(r.lu || 'Unlabelled')===subject).some(r=>statusOf(r.pct,r.date,dateType)!=='complete') ? 'Needs attention' : 'All complete'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection==='dashboard' ? (
        <section className="dashboard-panel">
          <div className="section-heading">
            <span className="section-kicker">Dashboard</span>
            <h2>{selectedDashboard ? selectedDashboard.subject : 'All subjects'}</h2>
            <p>{selectedDashboard ? (dashboardMetric ? 'Student completion details' : 'Subject completion overview') : 'Choose a subject to view its completion percentage.'}</p>
          </div>
          {!selectedDashboard && (
            rows.length===0 ? <div className="empty dashboard-empty"><b>No subjects available yet.</b><br/>Upload a roster to see subject completion data.</div> :
            <div className="subject-dashboard-grid">
              {dashboardSubjects.map(item=><button className="subject-dashboard-card" key={item.subject} onClick={()=>{setDashboardSubject(item.subject);setDashboardMetric(false);}}>
                <strong>{item.subject}</strong>
                <span>{item.students.length ? `${item.students.length} student${item.students.length===1?'':'s'}` : 'No roster data yet'}</span>
                <em>{item.students.length ? 'View completion →' : 'Upload matching data →'}</em>
              </button>)}
            </div>
          )}
          {selectedDashboard && !dashboardMetric && (
            <div className="dashboard-detail">
              <button className="dashboard-back" onClick={()=>setDashboardSubject(null)}>← All subjects</button>
              {selectedDashboard.students.length ? <>
                <button className="completion-drill-card" onClick={()=>setDashboardMetric(true)}>
                  <span>Average completion</span><strong>{selectedDashboard.average}%</strong><small>Click to see completed and incomplete students</small>
                </button>
                <div className="dashboard-summary-row"><span>{selectedDashboard.completed.length} completed</span><span>{selectedDashboard.incomplete.length} incomplete</span><span>{100-selectedDashboard.average}% pending</span></div>
              </> : <div className="empty dashboard-empty"><b>No roster data for this subject yet.</b><br/>Upload a sheet containing this subject to see completion details.</div>}
            </div>
          )}
          {selectedDashboard && dashboardMetric && (
            <div className="dashboard-detail">
              <button className="dashboard-back" onClick={()=>setDashboardMetric(false)}>← Back to {selectedDashboard.subject}</button>
              <div className="metric-strip"><div><small>Average completion</small><strong>{selectedDashboard.average}%</strong></div><div><small>Pending percentage</small><strong>{100-selectedDashboard.average}%</strong></div></div>
              <div className="student-columns">
                <div className="student-list complete-list"><h3>Completed students <span>{selectedDashboard.completed.length}</span></h3>{selectedDashboard.completed.length ? selectedDashboard.completed.map((student,index)=><div className="student-row" key={`${student.gmail}-${index}`}><b>{student.name || student.gmail || 'Unnamed student'}</b><span>{student.pct}%</span></div>) : <p>No completed students yet.</p>}</div>
                <div className="student-list incomplete-list"><h3>Students who did not complete <span>{selectedDashboard.incomplete.length}</span></h3>{selectedDashboard.incomplete.length ? selectedDashboard.incomplete.map((student,index)=><div className="student-row" key={`${student.gmail}-${index}`}><b>{student.name || student.gmail || 'Unnamed student'}</b><span>{student.pct}%</span></div>) : <p>Everyone has completed this subject.</p>}</div>
              </div>
            </div>
          )}
        </section>
      ) : (['home','dashboard','progress','assignments'].includes(activeSection) ? (rows.length===0 ? (
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
            <button className="notify-btn" onClick={()=>openDraftDirect(incomplete, true)} disabled={incomplete.length===0}>
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
                <tr><th>Folk</th><th>LU</th><th>Completion</th><th>{dateColLabel}</th><th>Status</th></tr>
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
                      <td className="status-cell">
                        <span className={"badge "+st}>{STATUS_META[st].label}</span>
                        {r.gmail && (
                          <button className="row-notify" onClick={()=>openDraftDirect([r], true)} title={`Email ${r.name||r.gmail}`}>✉</button>
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
                        {p.gmail && (
                          <button className="row-notify" onClick={()=>openDraftDirect([p.items.find(r=>statusOf(r.pct,r.date,dateType)!=='complete') || p.items[0]], true)} title={`Email ${p.name||p.gmail}`}>✉</button>
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
      )) : (
        <section className="section-panel">
          <div className="section-heading">
            <span className="section-kicker">Kalvium workspace</span>
            <h2>{activeSection==='community' ? 'Community' : activeSection==='resources' ? 'Resources' : 'Settings'}</h2>
            <p>{activeSection==='community' ? 'Connect with your squad and keep learning together.' : activeSection==='resources' ? 'Keep your learning materials and useful links close by.' : 'Manage your dashboard preferences and account settings.'}</p>
          </div>
          <div className="section-grid">
            {activeSection==='community' && <><button className="section-card" onClick={()=>alert('Squad discussions will be available here soon.')}><strong>Squad discussions</strong><span>Share updates, questions, and wins with your squad.</span></button><button className="section-card" onClick={()=>alert('Community events will be available here soon.')}><strong>Community events</strong><span>Discover upcoming sessions and peer learning activities.</span></button></>}
            {activeSection==='resources' && <><button className="section-card" onClick={()=>fileRef.current.click()}><strong>Upload roster</strong><span>Add an Excel roster to refresh your progress data.</span></button><button className="section-card" onClick={()=>alert('Learning resources will be available here soon.')}><strong>Learning library</strong><span>Browse guides, references, and course material.</span></button></>}
            {activeSection==='settings' && <><button className="section-card" onClick={()=>setTheme(theme==='light'?'dark':'light')}><strong>Appearance</strong><span>Switch between the {theme} theme and the other color mode.</span></button><button className="section-card" onClick={increaseFontSize}><strong>Text size</strong><span>Current size: {fontSize}. Click to increase it.</span></button><button className="section-card" onClick={signOut}><strong>Account</strong><span>Sign out of the current account.</span></button></>}
          </div>
        </section>
      ))}
        </main>
      </div>
    </div>
  );
}

