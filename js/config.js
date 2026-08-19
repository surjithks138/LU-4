// ==== Supabase setup ====
// 1. Create a free project at supabase.com
// 2. Project Settings -> API -> copy "Project URL" and the "anon public" / "publishable" key
// 3. Paste them below (do NOT paste your secret/service key here)
const SUPABASE_URL = 'https://xnyjdjfewytiiviiuupr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xRqeHx_gQZHvubDxGUGcJw_Hb7b1KdH';
const supabaseConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
const supabaseLibLoaded = typeof window.supabase !== 'undefined';
const supabaseReady = supabaseConfigured && supabaseLibLoaded;
const supabaseClient = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

