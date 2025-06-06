
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start bot session
  const startBot = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to start the bot');
      return false;
    }

    try {
      console.log('Starting bot session for user:', user.id);
      
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

      console.log('Bot session created:', session);
      setCurrentSession(session);
      setIsRunning(true);

      // Start monitoring loop
      startMonitoring(session.id, subreddits);
      
      toast.success('Bot started successfully! Monitor the activity feed for results.');
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
      console.log('Stopping bot session:', currentSession.id);
      
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

  // Enhanced question detection
  const isQuestion = (title: string, content: string = '') => {
    const text = (title + ' ' + content).toLowerCase().trim();
    
    // Skip if text is too short
    if (text.length < 10) return false;
    
    // Check for question marks
    if (text.includes('?')) return true;
    
    // Check for question words at the beginning or after common words
    const questionStarters = [
      'how ', 'what ', 'why ', 'when ', 'where ', 'which ', 'who ',
      'can ', 'could ', 'would ', 'should ', 'will ', 'do ', 'does ', 'did ',
      'is ', 'are ', 'was ', 'were ', 'has ', 'have ', 'had ',
      'help', 'advice', 'recommend', 'suggest', 'explain', 'question',
      'anyone know', 'does anyone', 'can someone', 'looking for'
    ];
    
    return questionStarters.some(starter => 
      text.startsWith(starter) || 
      text.includes(' ' + starter) ||
      text.includes('i ' + starter)
    );
  };

  // Monitor subreddits for questions
  const startMonitoring = (sessionId: string, subreddits: string[]) => {
    console.log('Starting monitoring for subreddits:', subreddits);
    
    const monitorLoop = async () => {
      if (!user) {
        console.log('No user found, stopping monitoring');
        return;
      }

      console.log('=== Starting monitoring cycle ===');

      for (const subreddit of subreddits) {
        try {
          console.log(`🔍 Checking r/${subreddit} for questions...`);
          
          // Get questions from Reddit
          const response = await supabase.functions.invoke('reddit-api', {
            body: {
              action: 'getQuestions',
              subredditName: subreddit,
            },
          });

          if (response.error) {
            console.error(`❌ Reddit API error for r/${subreddit}:`, response.error);
            toast.error(`Error accessing r/${subreddit}: ${response.error.message}`);
            
            // Update error count
            await supabase
              .from('bot_sessions')
              .update({
                error_count: currentSession ? currentSession.error_count + 1 : 1,
              })
              .eq('id', sessionId);
            
            continue;
          }

          const { questions } = response.data || {};
          
          if (!questions || questions.length === 0) {
            console.log(`📭 No posts found in r/${subreddit}`);
            continue;
          }

          console.log(`📥 Found ${questions.length} posts in r/${subreddit}`);
          
          // Filter for actual questions using enhanced detection
          const actualQuestions = questions.filter((post: any) => 
            isQuestion(post.title, post.selftext)
          );
          
          console.log(`❓ Filtered to ${actualQuestions.length} questions in r/${subreddit}`);
          
          if (actualQuestions.length === 0) {
            console.log(`⏭️ No questions detected in r/${subreddit}, skipping`);
            continue;
          }
          
          // Process each question (limit to 2 per subreddit per cycle to avoid spam)
          for (const question of actualQuestions.slice(0, 2)) {
            try {
              console.log(`🔄 Processing: "${question.title}" (ID: ${question.id})`);
              
              // Check if we've already answered this question
              const { data: existing } = await supabase
                .from('questions_answered')
                .select('id')
                .eq('reddit_post_id', question.id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (existing) {
                console.log(`✅ Already answered question ${question.id}, skipping`);
                continue;
              }

              console.log('🤖 Generating answer with Gemini AI...');
              
              // Generate answer using Gemini
              const aiResponse = await supabase.functions.invoke('gemini-ai', {
                body: {
                  question: question.selftext || question.title,
                  title: question.title,
                  subreddit: subreddit,
                },
              });

              if (aiResponse.error) {
                console.error('❌ Gemini AI error:', aiResponse.error);
                throw new Error(`AI generation failed: ${aiResponse.error.message}`);
              }

              const { answer } = aiResponse.data;
              if (!answer) {
                console.error('❌ No answer generated by AI');
                throw new Error('AI did not generate an answer');
              }
              
              console.log('✅ Generated answer:', answer.substring(0, 100) + '...');

              // Post comment to Reddit
              console.log('📤 Posting comment to Reddit...');
              const commentResponse = await supabase.functions.invoke('reddit-api', {
                body: {
                  action: 'postComment',
                  postId: question.id,
                  comment: answer,
                },
              });

              let commentId = null;
              let status = 'failed';

              if (!commentResponse.error && commentResponse.data?.success) {
                commentId = commentResponse.data.commentId;
                status = 'posted';
                console.log('🎉 Successfully posted comment:', commentId);
                toast.success(`Answer posted to r/${subreddit}!`);
              } else {
                console.error('❌ Failed to post comment:', commentResponse.error);
                toast.error(`Failed to post answer: ${commentResponse.error?.message || 'Unknown error'}`);
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
                  question_content: question.selftext || null,
                  question_author: question.author,
                  generated_answer: answer,
                  reddit_comment_id: commentId,
                  status: status,
                });

              if (saveError) {
                console.error('❌ Error saving answer:', saveError);
              } else {
                console.log('💾 Answer saved to database successfully');
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

              console.log(`✅ Completed processing: ${question.title} - Status: ${status}`);

              // Add a delay between processing questions to be respectful
              await new Promise(resolve => setTimeout(resolve, 5000));

            } catch (error) {
              console.error('❌ Error processing question:', error);
              toast.error(`Error processing question: ${error.message}`);
              
              // Update error count
              await supabase
                .from('bot_sessions')
                .update({
                  error_count: currentSession ? currentSession.error_count + 1 : 1,
                })
                .eq('id', sessionId);
            }
          }
        } catch (error) {
          console.error(`❌ Error monitoring r/${subreddit}:`, error);
          toast.error(`Error monitoring r/${subreddit}: ${error.message}`);
        }
      }

      console.log('=== Monitoring cycle completed ===');
    };

    // Run immediately once
    monitorLoop();
    
    // Then run every 2 minutes (increased from 90 seconds to be more respectful)
    intervalRef.current = setInterval(monitorLoop, 120000);
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
