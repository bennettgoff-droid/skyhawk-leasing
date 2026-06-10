const SUPABASE_URL = "https://YOUR-NEW-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
const AIRCRAFT_FILES_BUCKET = "aircraft-files";

window.skyhawkSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
