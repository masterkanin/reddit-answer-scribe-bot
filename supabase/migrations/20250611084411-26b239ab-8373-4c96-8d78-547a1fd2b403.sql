
-- Create a cron job to run the bot scheduler every minute
SELECT cron.schedule(
  'bot-scheduler',
  '* * * * *', -- every minute
  $$
  SELECT
    net.http_post(
        url:='https://zxzmomzfmqgesotdhaut.supabase.co/functions/v1/bot-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4em1vbXpmbXFnZXNvdGRoYXV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTA3NDYyNSwiZXhwIjoyMDY0NjUwNjI1fQ.0dKOCKKJy1s6Kz0S9yLJx-nNAH9xg-c6LYJmH5T4T3k"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);

-- Enable pg_cron and pg_net extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add RLS policies for bot_sessions and bot_credentials tables
DROP POLICY IF EXISTS "Users can view their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can create their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can update their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can delete their own bot sessions" ON public.bot_sessions;

CREATE POLICY "Users can view their own bot sessions" 
  ON public.bot_sessions 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot sessions" 
  ON public.bot_sessions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot sessions" 
  ON public.bot_sessions 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot sessions" 
  ON public.bot_sessions 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add RLS policies for bot_credentials
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.bot_credentials;
DROP POLICY IF EXISTS "Users can create their own credentials" ON public.bot_credentials;
DROP POLICY IF EXISTS "Users can update their own credentials" ON public.bot_credentials;

CREATE POLICY "Users can view their own credentials" 
  ON public.bot_credentials 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own credentials" 
  ON public.bot_credentials 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials" 
  ON public.bot_credentials 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Add RLS policies for questions_answered
DROP POLICY IF EXISTS "Users can view their own questions" ON public.questions_answered;
DROP POLICY IF EXISTS "Users can create their own questions" ON public.questions_answered;

CREATE POLICY "Users can view their own questions" 
  ON public.questions_answered 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own questions" 
  ON public.questions_answered 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
