import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://iunqiswpbqijkqylfrll.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bnFpc3dwYnFpamtxeWxmcmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODQ3NTIsImV4cCI6MjA5NzY2MDc1Mn0.1rqPzx_5nJU-1noObhW8AI44JuO-VkealUcv1JSwb9Y'
)
