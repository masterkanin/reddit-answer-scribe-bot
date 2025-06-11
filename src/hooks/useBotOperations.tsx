
import { useState, useEffect } from 'react';
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
  status: string;
  next_run_time: string | null;
  subreddit_list: string[];
  pause_reason: string | null;
  last_activity: string | null;
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

  const DAILY_COMMENT_LIMIT = 5;

  // Update session subreddits immediately
  const updateSessionSubreddits = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to save subreddits');
      return false;
    }

    try {
      console.log('💾 Updating session subreddits:', subreddits);
      
      // If there's an active session, update it
      if (currentSession) {
        const { error } = await supabase
          .from('bot_sessions')
          .update({
            subreddit_list: subreddits,
            last_activity: new Date().toISOString()
          })
          .eq('id', currentSession.id);

        if (error) {
          console.error('Error updating session subreddits:', error);
          toast.error('Failed to save subreddits');
          return false;
        }

        // Update local state
        setCurrentSession(prev => prev ? { ...prev, subreddit_list: subreddits } : null);
      } else if (subreddits.length > 0) {
        // Create a new inactive session to store subreddits
        const { data: session, error } = await supabase
          .from('bot_sessions')
          .insert({
            user_id: user.id,
            is_active: false,
            status: 'stopped',
            subreddit_list: subreddits,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating session for subreddits:', error);
          toast.error('Failed to save subreddits');
          return false;
        }

        setCurrentSession(session);
      }

      console.log('✅ Successfully updated session subreddits');
      return true;
    } catch (error) {
      console.error('Error updating session subreddits:', error);
      toast.error('Failed to save subreddits');
      return false;
    }
  };

  // Start persistent bot session
  const startBot = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to start the bot');
      return false;
    }

    if (subreddits.length === 0) {
      toast.error('Please add at least one subreddit to monitor');
      return false;
    }

    try {
      console.log('🚀 Starting persistent bot session for user:', user.id);
      
      // Check if there's already an active session
      const { data: existingSession } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (existingSession) {
        // Update existing session with new subreddit list
        const { data: session, error } = await supabase
          .from('bot_sessions')
          .update({
            subreddit_list: subreddits,
            status: 'active',
            next_run_time: null,
            pause_reason: null,
            last_activity: new Date().toISOString()
          })
          .eq('id', existingSession.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating session:', error);
          toast.error('Failed to update bot session');
          return false;
        }

        setCurrentSession(session);
        setIsRunning(true);
        toast.success('🤖 Bot session updated and running persistently!');
        return true;
      }

      // Find existing session with subreddits or create new one
      let sessionToUpdate = currentSession;
      if (!sessionToUpdate) {
        const { data: existingInactiveSession } = await supabase
          .from('bot_sessions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingInactiveSession) {
          sessionToUpdate = existingInactiveSession;
        }
      }

      if (sessionToUpdate) {
        // Update existing session to be active
        const { data: session, error } = await supabase
          .from('bot_sessions')
          .update({
            is_active: true,
            status: 'active',
            subreddit_list: subreddits,
            session_start: new Date().toISOString(),
            session_end: null,
            next_run_time: null,
            pause_reason: null,
            last_activity: new Date().toISOString()
          })
          .eq('id', sessionToUpdate.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating session:', error);
          toast.error('Failed to start bot session');
          return false;
        }

        setCurrentSession(session);
        setIsRunning(true);
        toast.success('🤖 Bot started and running persistently!');
        return true;
      }

      // Create completely new session
      const { data: session, error } = await supabase
        .from('bot_sessions')
        .insert({
          user_id: user.id,
          is_active: true,
          status: 'active',
          subreddit_list: subreddits,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating session:', error);
        toast.error('Failed to start bot session');
        return false;
      }

      console.log('✅ Persistent bot session created:', session);
      setCurrentSession(session);
      setIsRunning(true);
      
      toast.success('🤖 Bot started and running persistently! It will continue working even if you close this page.');
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
      console.log('🛑 Stopping persistent bot session:', currentSession.id);
      
      const { data: session, error } = await supabase
        .from('bot_sessions')
        .update({
          is_active: false,
          status: 'stopped',
          session_end: new Date().toISOString(),
        })
        .eq('id', currentSession.id)
        .select()
        .single();

      if (error) {
        console.error('Error stopping session:', error);
        toast.error('Failed to stop bot session');
        return;
      }

      setCurrentSession(session);
      setIsRunning(false);
      toast.success('Bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  // Check for existing session on load
  const checkExistingSession = async () => {
    if (!user) return;

    try {
      // First check for active session
      const { data: activeSession } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (activeSession) {
        console.log('📱 Found existing active session:', activeSession);
        setCurrentSession(activeSession);
        setIsRunning(true);
        return;
      }

      // If no active session, get the most recent session for subreddits
      const { data: recentSession } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentSession) {
        console.log('📱 Found recent session for subreddits:', recentSession);
        setCurrentSession(recentSession);
        setIsRunning(recentSession.is_active);
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
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

  // Check daily comment count
  const checkDailyLimits = async () => {
    if (!user) return;

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
  };

  // Set up real-time subscription for session updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('session-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_sessions',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Session update received:', payload);
          if (payload.eventType === 'UPDATE' && payload.new) {
            setCurrentSession(payload.new as BotSession);
            setIsRunning(payload.new.is_active);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Set up real-time subscription for new activities
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('activity-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'questions_answered',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('New activity received:', payload);
          fetchRecentActivities();
          checkDailyLimits();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Check for existing session and fetch data when user changes
  useEffect(() => {
    if (user) {
      checkExistingSession();
      fetchRecentActivities();
      checkDailyLimits();
    } else {
      setCurrentSession(null);
      setIsRunning(false);
      setRecentActivities([]);
      setDailyCommentCount(0);
    }
  }, [user]);

  const getStatusDisplay = () => {
    if (!currentSession) return 'Stopped';
    if (!currentSession.is_active) return 'Stopped';
    
    switch (currentSession.status) {
      case 'active':
        return 'Running';
      case 'paused':
        return `Paused: ${currentSession.pause_reason || 'Unknown reason'}`;
      case 'error':
        return 'Error - Too many failures';
      default:
        return currentSession.status;
    }
  };

  const getNextRunTime = () => {
    if (!currentSession?.next_run_time) return null;
    return new Date(currentSession.next_run_time);
  };

  return {
    currentSession,
    isRunning,
    recentActivities,
    startBot,
    stopBot,
    updateSessionSubreddits,
    fetchRecentActivities,
    dailyCommentCount,
    dailyLimit: DAILY_COMMENT_LIMIT,
    statusDisplay: getStatusDisplay(),
    nextRunTime: getNextRunTime(),
    subredditList: currentSession?.subreddit_list || [],
  };
};
