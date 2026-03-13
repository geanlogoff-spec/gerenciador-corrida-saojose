import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://qnwjlrhudiqznkusqgri.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFud2pscmh1ZGlxem5rdXNxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjkzMjIsImV4cCI6MjA4OTAwNTMyMn0.0glKiUhbBWOcxBRgZN9E5tybKiumiobCLtKTDKSXnqM');

async function seed() {
    const { data, error } = await supabase.auth.signUp({
        email: 'admin@saojose.com',
        password: 'saojose',
    });
    console.log('SignUp:', { data, error });
}
seed();
