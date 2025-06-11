
-- Add columns to bot_sessions for persistence and scheduling
ALTER TABLE public.bot_sessions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS next_run_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subreddit_list TEXT[],
ADD COLUMN IF NOT EXISTS pause_reason TEXT,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create an index for efficient querying of active sessions
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status_next_run ON public.bot_sessions(status, next_run_time) WHERE status IN ('active', 'paused');

-- Add RLS policies for bot_sessions table
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DROP POLICY IF EXISTS "Users can view their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can create their own bot sessions" ON public.bot_sessions;
DROP POLICY IF EXISTS "Users can update their own bot sessions" ON public.bot_sessions;

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

-- Enable realtime for bot_sessions so the UI can show live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_sessions;
