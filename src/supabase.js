import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://ckuszlzrpvmgnwxomhjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrdXN6bHpycHZtZ253eG9taGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjUxOTMsImV4cCI6MjA4NTkwMTE5M30.wNfF_7SjyiLHtTQUUe7jqPZvQXw05dR-yb-SnjFyZLo'
)