function AuthModal({onSignedIn, onClose}){
  const [tab,setTab] = useState('signin'); // 'signin' | 'signup'
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [error,setError] = useState('');
  const [info,setInfo] = useState('');
  const [busy,setBusy] = useState(false);

  if(!supabaseConfigured){
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="login-card" onClick={e=>e.stopPropagation()}>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
          <h1 className="login-title">Login not set up yet</h1>
          <p className="login-sub">
            This dashboard needs a free Supabase project to handle real accounts. Open this file's code,
            find <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> near the top of the script,
            and paste in your project's values from Project Settings → API.
          </p>
        </div>
      </div>
    );
  }

  if(!supabaseLibLoaded){
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="login-card" onClick={e=>e.stopPropagation()}>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
          <h1 className="login-title">Couldn't load the login library</h1>
          <p className="login-sub">
            The Supabase script (loaded from jsdelivr) didn't load. This usually happens when previewing
            this file inside an environment that blocks external scripts other than cdnjs.cloudflare.com —
            common inside chat-based artifact previews. Open this file directly as a regular file in a
            browser, or run it locally in VS Code (e.g. with the Live Server extension), and it should load
            correctly. If you're already doing that, check your internet connection or browser console for
            a blocked-request error.
          </p>
        </div>
      </div>
    );
  }

  async function submit(e){
    e.preventDefault();
    setError(''); setInfo('');
    if(!email.trim() || !password){ setError('Enter an email and password.'); return; }
    if(tab==='signup' && password !== confirm){ setError("Passwords don't match."); return; }
    if(tab==='signup' && password.length<6){ setError('Password should be at least 6 characters.'); return; }
    setBusy(true);
    try{
      if(tab==='signin'){
        const {data, error: err} = await supabaseClient.auth.signInWithPassword({email:email.trim(), password});
        if(err) throw err;
        onSignedIn(data.user);
      }else{
        const {data, error: err} = await supabaseClient.auth.signUp({email:email.trim(), password});
        if(err) throw err;
        if(data.session){ onSignedIn(data.user); }
        else { setInfo('Account created — check your email to confirm before signing in.'); }
      }
    }catch(err){
      setError(err.message || 'Something went wrong.');
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="login-card" onClick={e=>e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <h1 className="login-title">{tab==='signin' ? 'Sign in' : 'Create account'}</h1>
        <p className="login-sub">Real account, backed by Supabase — your password is never stored here.</p>

        <div className="login-mode-toggle">
          <button type="button" className={tab==='signin'?'active':''} onClick={()=>{setTab('signin');setError('');setInfo('');}}>Sign in</button>
          <button type="button" className={tab==='signup'?'active':''} onClick={()=>{setTab('signup');setError('');setInfo('');}}>Sign up</button>
        </div>

        <label className="login-label">Email address</label>
        <input className="login-input" type="email" placeholder="you@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} />

        <label className="login-label">Password</label>
        <input className="login-input" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} />

        {tab==='signup' && (
          <>
            <label className="login-label">Confirm password</label>
            <input className="login-input" type="password" placeholder="••••••••" value={confirm} onChange={e=>setConfirm(e.target.value)} />
          </>
        )}

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-hint">{info}</p>}

        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Please wait…' : (tab==='signin' ? 'Sign in' : 'Create account')}
        </button>
      </form>
    </div>
  );
}

