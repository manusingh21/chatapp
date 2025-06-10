const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for server-side
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY; // For client-side

// Server-side client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Client-side configuration
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

module.exports = { supabase, supabaseClient };