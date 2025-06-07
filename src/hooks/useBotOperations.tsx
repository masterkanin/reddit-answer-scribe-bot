
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
  const [dailyCommentCount, setDailyCommentCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState<Date | null>(null);

  // Conservative limits to prevent suspension
  const DAILY_COMMENT_LIMIT = 10;
  const HOURLY_COMMENT_LIMIT = 3;
  const MAX_ERRORS_BEFORE_COOLDOWN = 3;
  const COOLDOWN_DURATION = 30 * 60 * 1000; // 30 minutes
  const BASE_MONITORING_INTERVAL = 15 * 60 * 1000; // 15 minutes
  const MIN_DELAY_BETWEEN_ACTIONS = 2 * 60 * 1000; // 2 minutes
  const MAX_DELAY_BETWEEN_ACTIONS = 5 * 60 * 1000; // 5 minutes

  // Get random delay to make behavior less predictable
  const getRandomDelay = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

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

  // Start bot session
  const startBot = async (subreddits: string[]) => {
    if (!user) {
      toast.error('Please sign in to start the bot');
      return false;
    }

    // Check if we're in cooldown
    if (isInCooldown()) {
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (Date.now() - (lastErrorTime?.getTime() || 0))) / 60000);
      toast.error(`Bot is in cooldown mode due to recent errors. Please wait ${remainingTime} minutes.`);
      return false;
    }

    try {
      console.log('🚀 Starting conservative bot session for user:', user.id);
      
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

      console.log('✅ Conservative bot session created:', session);
      setCurrentSession(session);
      setIsRunning(true);

      // Reset error count on successful start
      setErrorCount(0);

      // Start conservative monitoring loop
      startConservativeMonitoring(session.id, subreddits);
      
      toast.success('🐌 Conservative bot started! Operating with anti-suspension measures.');
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
      console.log('🛑 Stopping conservative bot session:', currentSession.id);
      
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

  // Enhanced question detection with better filtering
  const isQuestion = (title: string, content: string = '') => {
    const text = (title + ' ' + content).toLowerCase().trim();
    
    // Skip if text is too short or too long (avoid low quality posts)
    if (text.length < 15 || text.length > 2000) return false;
    
    // Skip certain patterns that might be problematic
    const skipPatterns = [
      'upvote', 'downvote', 'karma', 'gold', 'award',
      'mod', 'moderator', 'ban', 'remove',
      'nsfw', 'explicit', 'sexual',
      'political', 'controversial'
    ];
    
    if (skipPatterns.some(pattern => text.includes(pattern))) {
      return false;
    }
    
    // Check for question marks
    if (text.includes('?')) return true;
    
    // Check for question words - more selective
    const questionStarters = [
      'how do i', 'how can i', 'what is', 'why does', 'when should',
      'where can', 'which one', 'who knows',
      'can someone explain', 'does anyone know', 'help me understand',
      'looking for advice', 'need help with'
    ];
    
    return questionStarters.some(starter => text.includes(starter));
  };

  // Conservative monitoring with extended delays and limits
  const startConservativeMonitoring = (sessionId: string, subreddits: string[]) => {
    console.log('🔍 Starting CONSERVATIVE monitoring for subreddits:', subreddits);
    
    const conservativeMonitorLoop = async () => {
      if (!user) {
        console.log('❌ No user found, stopping monitoring');
        return;
      }

      console.log('=== 🐌 Starting CONSERVATIVE monitoring cycle ===');

      // Check if we're in cooldown
      if (isInCooldown()) {
        console.log('⏸️ Bot in cooldown mode, skipping cycle');
        return;
      }

      // Check daily limits
      const canContinue = await checkDailyLimits();
      if (!canContinue) {
        console.log('🛑 Daily/hourly limits reached, pausing bot');
        await stopBot();
        return;
      }

      // Shuffle subreddits to vary order
      const shuffledSubreddits = [...subreddits].sort(() => Math.random() - 0.5);

      for (const subreddit of shuffledSubreddits) {
        try {
          console.log(`🔍 Checking r/${subreddit} (conservative mode)...`);
          
          // Add random delay before each subreddit check
          const preDelay = getRandomDelay(30000, 90000); // 30-90 seconds
          console.log(`⏱️ Random delay: ${preDelay/1000}s before checking r/${subreddit}`);
          await new Promise(resolve => setTimeout(resolve, preDelay));

          // Get questions from Reddit
          const response = await supabase.functions.invoke('reddit-api', {
            body: {
              action: 'getQuestions',
              subredditName: subreddit,
            },
          });

          if (response.error) {
            console.error(`❌ Reddit API error for r/${subreddit}:`, response.error);
            
            // Increment error count and set last error time
            setErrorCount(prev => prev + 1);
            setLastErrorTime(new Date());
            
            // Check if we should enter cooldown
            if (errorCount + 1 >= MAX_ERRORS_BEFORE_COOLDOWN) {
              toast.error(`Multiple Reddit API errors detected. Entering 30-minute cooldown to protect account.`);
              await stopBot();
              return;
            }
            
            toast.error(`Error accessing r/${subreddit}: ${response.error.message}`);
            
            // Update error count in session
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
          
          // Filter for high-quality questions using enhanced detection
          const qualityQuestions = questions.filter((post: any) => 
            isQuestion(post.title, post.selftext) && 
            post.score >= 1 && // Only answer posts with positive score
            post.num_comments < 20 // Avoid heavily discussed posts
          );
          
          console.log(`❓ Filtered to ${qualityQuestions.length} quality questions in r/${subreddit}`);
          
          if (qualityQuestions.length === 0) {
            console.log(`⏭️ No quality questions detected in r/${subreddit}, skipping`);
            continue;
          }
          
          // VERY CONSERVATIVE: Only process 1 question per subreddit, and only the best one
          const bestQuestion = qualityQuestions
            .sort((a: any, b: any) => b.score - a.score)[0]; // Sort by score, take the highest

          if (bestQuestion) {
            try {
              console.log(`🔄 Processing BEST question: "${bestQuestion.title}" (Score: ${bestQuestion.score})`);
              
              // Check if we've already answered this question
              const { data: existing } = await supabase
                .from('questions_answered')
                .select('id')
                .eq('reddit_post_id', bestQuestion.id)
                .eq('user_id', user.id)
                .maybeSingle();

              if (existing) {
                console.log(`✅ Already answered question ${bestQuestion.id}, skipping`);
                continue;
              }

              // Check limits one more time before posting
              const canPost = await checkDailyLimits();
              if (!canPost) {
                console.log('🛑 Hit limits during processing, stopping');
                await stopBot();
                return;
              }

              console.log('🤖 Generating answer with Gemini AI...');
              
              // Generate answer using Gemini
              const aiResponse = await supabase.functions.invoke('gemini-ai', {
                body: {
                  question: bestQuestion.selftext || bestQuestion.title,
                  title: bestQuestion.title,
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

              // Add longer delay before posting comment
              const postDelay = getRandomDelay(MIN_DELAY_BETWEEN_ACTIONS, MAX_DELAY_BETWEEN_ACTIONS);
              console.log(`⏱️ Waiting ${postDelay/1000}s before posting comment (human-like behavior)...`);
              await new Promise(resolve => setTimeout(resolve, postDelay));

              // Post comment to Reddit
              console.log('📤 Posting comment to Reddit (conservative mode)...');
              const commentResponse = await supabase.functions.invoke('reddit-api', {
                body: {
                  action: 'postComment',
                  postId: bestQuestion.id,
                  comment: answer,
                },
              });

              let commentId = null;
              let status = 'failed';

              if (!commentResponse.error && commentResponse.data?.success) {
                commentId = commentResponse.data.commentId;
                status = 'posted';
                console.log('🎉 Successfully posted comment:', commentId);
                toast.success(`✅ Answer posted to r/${subreddit}! (${dailyCommentCount + 1}/${DAILY_COMMENT_LIMIT} today)`);
                
                // Reset error count on successful post
                setErrorCount(0);
              } else {
                console.error('❌ Failed to post comment:', commentResponse.error);
                setErrorCount(prev => prev + 1);
                setLastErrorTime(new Date());
                toast.error(`Failed to post answer: ${commentResponse.error?.message || 'Unknown error'}`);
              }

              // Save to database
              const { error: saveError } = await supabase
                .from('questions_answered')
                .insert({
                  user_id: user.id,
                  session_id: sessionId,
                  subreddit_name: subreddit,
                  reddit_post_id: bestQuestion.id,
                  question_title: bestQuestion.title,
                  question_content: bestQuestion.selftext || null,
                  question_author: bestQuestion.author,
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

              console.log(`✅ Completed processing: ${bestQuestion.title} - Status: ${status}`);

              // IMPORTANT: Break after processing ONE question across ALL subreddits
              // This is very conservative to avoid triggering anti-spam
              console.log('🛑 Processed one question this cycle - taking extended break to avoid spam detection');
              break;

            } catch (error) {
              console.error('❌ Error processing question:', error);
              setErrorCount(prev => prev + 1);
              setLastErrorTime(new Date());
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
          setErrorCount(prev => prev + 1);
          setLastErrorTime(new Date());
          toast.error(`Error monitoring r/${subreddit}: ${error.message}`);
        }
      }

      console.log('=== 🐌 CONSERVATIVE monitoring cycle completed ===');
    };

    // Run immediately once
    conservativeMonitorLoop();
    
    // Then run every 15 minutes (much more conservative than before)
    intervalRef.current = setInterval(conservativeMonitorLoop, BASE_MONITORING_INTERVAL);
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

  // Load daily comment count on startup
  useEffect(() => {
    if (user) {
      checkDailyLimits();
    }
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
  };
};
