
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
  const intervalRef = useRef<number | null>(null);

  // Start bot session
  const startBot = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to start the bot');
      return false;
    }

    try {
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

      setCurrentSession(session);
      setIsRunning(true);

      // Start monitoring loop
      startMonitoring(session.id, subreddits);
      
      toast.success('Bot started successfully');
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
      // Stop monitoring loop
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

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
      toast.success('Bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  // Monitor subreddits for questions
  const startMonitoring = (sessionId: string, subreddits: string[]) => {
    const monitorLoop = async () => {
      if (!user) return;

      console.log('Monitoring subreddits:', subreddits);

      for (const subreddit of subreddits) {
        try {
          // Get questions from Reddit
          const response = await supabase.functions.invoke('reddit-api', {
            body: {
              action: 'getQuestions',
              subredditName: subreddit,
            },
          });

          if (response.error) {
            console.error('Reddit API error:', response.error);
            continue;
          }

          const { questions } = response.data;
          
          // Process each question
          for (const question of questions.slice(0, 3)) { // Limit to 3 questions per cycle
            try {
              // Check if we've already answered this question
              const { data: existing } = await supabase
                .from('questions_answered')
                .select('id')
                .eq('reddit_post_id', question.id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (existing) continue; // Already answered

              // Generate answer using Gemini
              const aiResponse = await supabase.functions.invoke('gemini-ai', {
                body: {
                  question: question.selftext || question.title,
                  title: question.title,
                  subreddit: subreddit,
                },
              });

              if (aiResponse.error) {
                console.error('Gemini AI error:', aiResponse.error);
                continue;
              }

              const { answer } = aiResponse.data;

              // Post comment to Reddit
              const commentResponse = await supabase.functions.invoke('reddit-api', {
                body: {
                  action: 'postComment',
                  postId: question.id,
                  comment: answer,
                },
              });

              let commentId = null;
              let status = 'failed';

              if (!commentResponse.error && commentResponse.data.success) {
                commentId = commentResponse.data.commentId;
                status = 'posted';
              }

              // Save to database
              const { error: saveError } = await supabase
                .from('questions_answered')
                .insert({
                  user_id: user.id,
                  session_id: sessionId,
                  subreddit_name: subreddit,
                  reddit_post_id: question.id,
                  question_title: question.title,
                  question_content: question.selftext,
                  question_author: question.author,
                  generated_answer: answer,
                  reddit_comment_id: commentId,
                  status: status,
                });

              if (saveError) {
                console.error('Error saving answer:', saveError);
              }

              // Update session stats
              await supabase
                .from('bot_sessions')
                .update({
                  questions_processed: currentSession ? currentSession.questions_processed + 1 : 1,
                  successful_answers: status === 'posted' ? 
                    (currentSession ? currentSession.successful_answers + 1 : 1) : 
                    (currentSession ? currentSession.successful_answers : 0),
                })
                .eq('id', sessionId);

              console.log(`Processed question: ${question.title} - Status: ${status}`);

            } catch (error) {
              console.error('Error processing question:', error);
            }
          }
        } catch (error) {
          console.error(`Error monitoring r/${subreddit}:`, error);
        }
      }
    };

    // Run every 60 seconds
    intervalRef.current = setInterval(monitorLoop, 60000);
    
    // Run immediately once
    monitorLoop();
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Fetch activities on user change
  useEffect(() => {
    if (user) {
      fetchRecentActivities();
    } else {
      setRecentActivities([]);
    }
  }, [user]);

  return {
    currentSession,
    isRunning,
    recentActivities,
    startBot,
    stopBot,
    fetchRecentActivities,
  };
};
