// ==== Supabase setup ====
// 1. Create a free project at supabase.com
// 2. Project Settings -> API -> copy "Project URL" and the "anon public" / "publishable" key
// 3. Paste them below (do NOT paste your secret/service key here)
const SUPABASE_URL = 'https://erwelgfyuhorkpfpzzee.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_20ugYijXCXTAejfjsW9VUA_emeOZHtJ';
const supabaseConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
const supabaseLibLoaded = typeof window.supabase !== 'undefined';
const supabaseReady = supabaseConfigured && supabaseLibLoaded;
const supabaseClient = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

