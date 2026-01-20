import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://bqwtagwchrrapwaxpoim.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxd3RhZ3djaHJyYXB3YXhwb2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODU5MzIsImV4cCI6MjA4NDE2MTkzMn0.GQ-fZeiom2pXUnV-hxUbD0JZa_flrSJPm1CzlWJizUk";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
