import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qnwjlrhudiqznkusqgri.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFud2pscmh1ZGlxem5rdXNxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjkzMjIsImV4cCI6MjA4OTAwNTMyMn0.0glKiUhbBWOcxBRgZN9E5tybKiumiobCLtKTDKSXnqM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

