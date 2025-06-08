
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BotSession {
  id: string;
  user_id: string;
  session_start: string;
  session_end: string | null;
  is_active: boolean;
  error_count: number;
  questions_processed: number;
  successful_answers: number;
}

export interface QuestionAnswered {
  id: string;
  subreddit_name: string;
  reddit_post_id: string;
  question_title: string;
  question_content: string | null;
  question_author: string;
  generated_answer: string;
  reddit_comment_id: string | null;
  status: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
}

export const useBotOperations = () => {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<BotSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [recentActivities, setRecentActivities] = useState<QuestionAnswered[]>([]);
  const [dailyCommentCount, setDailyCommentCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState<Date | null>(null);
  const [apiCallCount, setApiCallCount] = useState(0);
  const [lastApiReset, setLastApiReset] = useState(Date.now());
  const [isShadowbanned, setIsShadowbanned] = useState(false);

  // REDDIT COMPLIANCE: Conservative limits
  const DAILY_COMMENT_LIMIT = 5;
  const HOURLY_COMMENT_LIMIT = 2;
  const MAX_ERRORS_BEFORE_COOLDOWN = 2;
  const COOLDOWN_DURATION = 60 * 60 * 1000; // 60 minutes
  const API_RATE_LIMIT = 50;
  const API_RESET_INTERVAL = 60 * 1000;
  const SHADOWBAN_DETECTION_THRESHOLD = 5;

  // Check if we're in cooldown period due to errors
  const isInCooldown = () => {
    if (!lastErrorTime || errorCount < MAX_ERRORS_BEFORE_COOLDOWN) return false;
    const timeSinceLastError = Date.now() - lastErrorTime.getTime();
    return timeSinceLastError < COOLDOWN_DURATION;
  };

  // Check daily comment limits
  const checkDailyLimits = async () => {
    if (!user) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayComments } = await supabase
      .from('questions_answered')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'posted')
      .gte('created_at', today.toISOString());

    const todayCount = todayComments?.length || 0;
    setDailyCommentCount(todayCount);

    if (todayCount >= DAILY_COMMENT_LIMIT) {
      console.log(`🛑 Daily comment limit reached (${todayCount}/${DAILY_COMMENT_LIMIT})`);
      toast.warning(`Daily comment limit reached (${todayCount}/${DAILY_COMMENT_LIMIT}). Bot will pause until tomorrow.`);
      return false;
    }

    // Check hourly limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { data: hourlyComments } = await supabase
      .from('questions_answered')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'posted')
      .gte('created_at', oneHourAgo.toISOString());

    const hourlyCount = hourlyComments?.length || 0;
    if (hourlyCount >= HOURLY_COMMENT_LIMIT) {
      console.log(`⏳ Hourly comment limit reached (${hourlyCount}/${HOURLY_COMMENT_LIMIT}). Waiting...`);
      return false;
    }

    return true;
  };

  // Start bot session (server-side automation)
  const startBot = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to start the bot');
      return false;
    }

    // Check for shadowban
    if (isShadowbanned) {
      toast.error('Account appears to be shadowbanned. Please wait 24 hours before retrying.');
      return false;
    }

    // Check if we're in cooldown
    if (isInCooldown()) {
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (Date.now() - (lastErrorTime?.getTime() || 0))) / 60000);
      toast.error(`Bot is in cooldown mode. Please wait ${remainingTime} minutes.`);
      return false;
    }

    try {
      console.log('🚀 Starting server-side automated bot session for user:', user.id);
      
      // Create new session
      const { data: session, error } = await supabase
        .from('bot_sessions')
        .insert({
          user_id: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating session:', error);
        toast.error('Failed to start bot session');
        return false;
      }

      console.log('✅ Server-side bot session created:', session);
      setCurrentSession(session);
      setIsRunning(true);

      // Reset error count and shadowban status
      setErrorCount(0);
      setIsShadowbanned(false);

      // Save monitored subreddits to database
      for (const subredditName of subreddits) {
        await supabase
          .from('subreddit_monitoring')
          .upsert({
            user_id: user.id,
            subreddit_name: subredditName,
            is_active: true,
          }, {
            onConflict: 'user_id, subreddit_name'
          });
      }
      
      toast.success('🤖 Server-side Reddit bot started! It will run automatically even when you close this page.');
      toast.info('📊 The bot runs on Supabase servers and will check for questions every 3-5 minutes.');
      return true;
    } catch (error) {
      console.error('Error starting bot:', error);
      toast.error('Failed to start bot');
      return false;
    }
  };

  // Stop bot session
  const stopBot = async () => {
    if (!currentSession) return;

    try {
      console.log('🛑 Stopping server-side bot session:', currentSession.id);
      
      // Update session
      const { error } = await supabase
        .from('bot_sessions')
        .update({
          is_active: false,
          session_end: new Date().toISOString(),
        })
        .eq('id', currentSession.id);

      if (error) {
        console.error('Error stopping session:', error);
      }

      setCurrentSession(null);
      setIsRunning(false);
      toast.success('Server-side bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  // Fetch recent activities
  const fetchRecentActivities = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('questions_answered')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching activities:', error);
        return;
      }

      setRecentActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  // Check for active session on load
  useEffect(() => {
    const checkActiveSession = async () => {
      if (!user) return;

      try {
        const { data: activeSession } = await supabase
          .from('bot_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSession) {
          setCurrentSession(activeSession);
          setIsRunning(true);
          console.log('Found active server-side session:', activeSession.id);
        }
      } catch (error) {
        console.error('Error checking active session:', error);
      }
    };

    if (user) {
      checkActiveSession();
      fetchRecentActivities();
      checkDailyLimits();
    } else {
      setRecentActivities([]);
      setCurrentSession(null);
      setIsRunning(false);
    }
  }, [user]);

  // Set up real-time updates for activities
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('questions-answered-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'questions_answered',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('New question answered:', payload);
          fetchRecentActivities();
          checkDailyLimits();
          toast.success('✅ New answer posted by server-side bot!');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return {
    currentSession,
    isRunning,
    recentActivities,
    startBot,
    stopBot,
    fetchRecentActivities,
    dailyCommentCount,
    dailyLimit: DAILY_COMMENT_LIMIT,
    isInCooldown: isInCooldown(),
    errorCount,
    isShadowbanned,
    apiCallCount,
    apiRateLimit: API_RATE_LIMIT,
  };
};
