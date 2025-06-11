import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`🚀 Reddit Bot Scheduler invoked at: ${new Date().toISOString()}`);
  console.log(`📝 Request method: ${req.method}`);
  console.log(`📝 Request URL: ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.pathname === '/health') {
    console.log('🏥 Health check requested');
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log(`🔑 Environment check:`);
    console.log(`- SUPABASE_URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
    console.log(`- SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'SET (length: ' + supabaseServiceKey.length + ')' : 'MISSING'}`);

    if (!supabaseUrl || !supabaseServiceKey) {
      const errorMsg = 'Missing required environment variables';
      console.error(`❌ ${errorMsg}`);
      return new Response(JSON.stringify({ 
        error: errorMsg,
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !supabaseServiceKey
        },
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🚀 Reddit Bot Scheduler started at:', new Date().toISOString());

    // Create admin Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false
      },
    });

    console.log('✅ Supabase client created successfully');

    // First, clean up old failed sessions (older than 1 hour with errors)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    console.log('🧹 Cleaning up old failed sessions...');
    
    const { data: oldSessions, error: cleanupError } = await supabase
      .from('bot_sessions')
      .update({ is_active: false, session_end: new Date().toISOString() })
      .eq('is_active', true)
      .gte('error_count', 3)
      .lt('created_at', oneHourAgo.toISOString())
      .select();

    if (cleanupError) {
      console.error('❌ Error cleaning up old sessions:', cleanupError);
    } else {
      console.log(`✅ Cleaned up ${oldSessions?.length || 0} old failed sessions`);
    }

    // Get all active bot sessions - REMOVED THE PROFILES JOIN
    console.log('📊 Fetching active bot sessions...');
    const { data: activeSessions, error: sessionsError } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('is_active', true);

    if (sessionsError) {
      console.error('❌ Error fetching active sessions:', sessionsError);
      throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
    }

    console.log(`📊 Found ${activeSessions?.length || 0} active bot sessions`);

    if (!activeSessions || activeSessions.length === 0) {
      console.log('ℹ️ No active bot sessions found, scheduler will wait for next cycle');
      return new Response(JSON.stringify({ 
        message: 'No active bot sessions found',
        processed: 0,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalProcessed = 0;
    let totalErrors = 0;
    const sessionResults = [];

    // Process each active session
    for (const session of activeSessions) {
      const sessionStartTime = Date.now();
      console.log(`\n🔄 Processing session ${session.id} for user ${session.user_id}`);
      console.log(`📊 Session stats: errors=${session.error_count}, processed=${session.questions_processed}, successful=${session.successful_answers}`);
      
      try {
        // Skip sessions with too many errors (unless we just cleaned them up)
        if (session.error_count >= 5) {
          console.log(`⚠️ Skipping session ${session.id} due to high error count (${session.error_count})`);
          await supabase
            .from('bot_sessions')
            .update({ is_active: false, session_end: new Date().toISOString() })
            .eq('id', session.id);
          continue;
        }

        // Check daily limits for this user
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        console.log('📅 Checking daily limits...');
        const { data: todayComments, error: dailyError } = await supabase
          .from('questions_answered')
          .select('id, created_at')
          .eq('user_id', session.user_id)
          .eq('status', 'posted')
          .gte('created_at', today.toISOString());

        if (dailyError) {
          console.error('❌ Error checking daily limits:', dailyError);
          throw dailyError;
        }

        const dailyCount = todayComments?.length || 0;
        const DAILY_LIMIT = 5;

        console.log(`📈 Daily progress for user ${session.user_id}: ${dailyCount}/${DAILY_LIMIT} comments`);

        if (dailyCount >= DAILY_LIMIT) {
          console.log(`🛑 User ${session.user_id} has reached daily limit (${dailyCount}/${DAILY_LIMIT})`);
          sessionResults.push({
            sessionId: session.id,
            userId: session.user_id,
            status: 'daily_limit_reached',
            dailyCount
          });
          continue;
        }

        // Check hourly limit with more detailed logging
        console.log('⏰ Checking hourly limits...');
        const oneHourAgoCheck = new Date(Date.now() - 60 * 60 * 1000);
        const { data: hourlyComments, error: hourlyError } = await supabase
          .from('questions_answered')
          .select('id, created_at')
          .eq('user_id', session.user_id)
          .eq('status', 'posted')
          .gte('created_at', oneHourAgoCheck.toISOString());

        if (hourlyError) {
          console.error('❌ Error checking hourly limits:', hourlyError);
          throw hourlyError;
        }

        const hourlyCount = hourlyComments?.length || 0;
        const HOURLY_LIMIT = 2;

        console.log(`⏱️ Hourly progress for user ${session.user_id}: ${hourlyCount}/${HOURLY_LIMIT} comments in last hour`);
        
        if (hourlyCount >= HOURLY_LIMIT) {
          console.log(`⏳ User ${session.user_id} has reached hourly limit (${hourlyCount}/${HOURLY_LIMIT})`);
          sessionResults.push({
            sessionId: session.id,
            userId: session.user_id,
            status: 'hourly_limit_reached',
            hourlyCount
          });
          continue;
        }

        // Get user's monitored subreddits
        console.log('📋 Fetching monitored subreddits...');
        const { data: monitoredSubreddits, error: subredditError } = await supabase
          .from('subreddit_monitoring')
          .select('subreddit_name')
          .eq('user_id', session.user_id)
          .eq('is_active', true);

        if (subredditError) {
          console.error(`❌ Error fetching subreddits for user ${session.user_id}:`, subredditError);
          throw subredditError;
        }

        const subreddits = monitoredSubreddits?.map(s => s.subreddit_name) || 
                          ['AskReddit', 'explainlikeimfive', 'NoStupidQuestions'];

        console.log(`📋 Monitored subreddits for user ${session.user_id}:`, subreddits);

        // Try to find and process a question
        let foundQuestion = false;
        let attempts = 0;
        const maxAttempts = Math.min(3, subreddits.length);
        let lastError = null;

        while (!foundQuestion && attempts < maxAttempts) {
          const randomIndex = Math.floor(Math.random() * subreddits.length);
          const randomSubreddit = subreddits[randomIndex];
          attempts++;
          
          console.log(`🎯 Attempt ${attempts}/${maxAttempts}: Checking r/${randomSubreddit} for user ${session.user_id}`);

          try {
            console.log('🔗 Calling Reddit API...');
            const redditResponse = await fetch(`${supabaseUrl}/functions/v1/reddit-api`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'getQuestions',
                subredditName: randomSubreddit,
                userId: session.user_id,
              }),
            });

            console.log(`📡 Reddit API response status: ${redditResponse.status}`);

            if (!redditResponse.ok) {
              const errorText = await redditResponse.text();
              console.error(`❌ Reddit API error for r/${randomSubreddit}:`, errorText);
              lastError = `Reddit API error: ${errorText}`;
              continue;
            }

            const redditData = await redditResponse.json();
            const questions = redditData.questions;
            console.log(`📊 Found ${questions?.length || 0} posts in r/${randomSubreddit}`);
            
            if (!questions || questions.length === 0) {
              console.log(`⚠️ No posts found in r/${randomSubreddit}, trying next subreddit`);
              lastError = 'No posts found';
              continue;
            }

            // Filter for suitable questions
            console.log('🔍 Filtering questions...');
            const suitableQuestions = questions.filter((post: any) => {
              const isQuestion = isUnansweredQuestion(post.title, post.selftext, post.num_comments);
              const hasMinScore = post.score >= 1;
              const isNotTooOld = (Date.now() / 1000 - post.created_utc) < (24 * 60 * 60);
              
              console.log(`📝 Post "${post.title.substring(0, 50)}...": question=${isQuestion}, score=${post.score}/${hasMinScore}, age=${Math.round((Date.now() / 1000 - post.created_utc) / 3600)}h/${isNotTooOld}`);
              
              return isQuestion && hasMinScore && isNotTooOld;
            });
            
            console.log(`🔍 Found ${suitableQuestions.length} suitable questions in r/${randomSubreddit}`);
            
            if (suitableQuestions.length === 0) {
              console.log(`⚠️ No suitable questions in r/${randomSubreddit}, trying next subreddit`);
              lastError = 'No suitable questions found';
              continue;
            }

            // Check if we already answered any of these questions
            console.log('🔍 Checking for already answered questions...');
            const questionIds = suitableQuestions.map((q: any) => q.id);
            const { data: alreadyAnswered } = await supabase
              .from('questions_answered')
              .select('reddit_post_id')
              .eq('user_id', session.user_id)
              .in('reddit_post_id', questionIds);

            const answeredIds = new Set(alreadyAnswered?.map(a => a.reddit_post_id) || []);
            const unansweredQuestions = suitableQuestions.filter((q: any) => !answeredIds.has(q.id));
            
            console.log(`📋 Filtered out ${answeredIds.size} already answered questions, ${unansweredQuestions.length} remaining`);

            if (unansweredQuestions.length === 0) {
              console.log(`⚠️ All suitable questions already answered in r/${randomSubreddit}, trying next subreddit`);
              lastError = 'All questions already answered';
              continue;
            }

            // Select the best question
            const topQuestion = unansweredQuestions
              .sort((a: any, b: any) => b.score - a.score)[0];

            console.log(`🎯 Selected question: "${topQuestion.title}" (score: ${topQuestion.score}, comments: ${topQuestion.num_comments})`);

            // Generate answer
            console.log('🤖 Generating answer with Gemini...');
            const geminiResponse = await fetch(`${supabaseUrl}/functions/v1/gemini-ai`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                question: topQuestion.selftext || topQuestion.title,
                title: topQuestion.title,
                subreddit: randomSubreddit,
                userId: session.user_id,
              }),
            });

            console.log(`🤖 Gemini API response status: ${geminiResponse.status}`);

            if (!geminiResponse.ok) {
              const errorText = await geminiResponse.text();
              console.error(`❌ Gemini API error:`, errorText);
              lastError = `Gemini API error: ${errorText}`;
              continue;
            }

            const geminiData = await geminiResponse.json();
            const answer = geminiData.answer;
            
            if (!answer) {
              console.error(`❌ No answer generated`);
              lastError = 'No answer generated';
              continue;
            }

            console.log(`✅ Generated answer (${answer.length} chars)`);

            // Add bot disclaimer
            const BOT_DISCLAIMER = "\n\n---\n*I'm an automated helper bot. This response was generated by AI to help answer your question.*";
            const finalAnswer = answer + BOT_DISCLAIMER;

            // Random delay for compliance
            const delay = Math.floor(Math.random() * (240000 - 120000 + 1)) + 120000; // 2-4 minutes
            console.log(`⏰ Waiting ${Math.round(delay/1000)}s before posting...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Post comment
            console.log('📤 Posting comment to Reddit...');
            const commentResponse = await fetch(`${supabaseUrl}/functions/v1/reddit-api`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'postComment',
                postId: topQuestion.id,
                comment: finalAnswer,
                userId: session.user_id,
              }),
            });

            console.log(`📤 Comment post response status: ${commentResponse.status}`);

            let commentId = null;
            let status = 'failed';

            if (commentResponse.ok) {
              const commentData = await commentResponse.json();
              if (commentData.success) {
                commentId = commentData.commentId;
                status = 'posted';
                console.log(`🎉 Successfully posted comment: ${commentId}`);
                totalProcessed++;
                foundQuestion = true;
              } else {
                console.error(`❌ Comment posting failed:`, commentData);
                lastError = `Comment posting failed: ${JSON.stringify(commentData)}`;
              }
            } else {
              const errorText = await commentResponse.text();
              console.error(`❌ Failed to post comment:`, errorText);
              lastError = `Failed to post comment: ${errorText}`;
            }

            // Save to database
            console.log('💾 Saving to database...');
            const { error: insertError } = await supabase
              .from('questions_answered')
              .insert({
                user_id: session.user_id,
                session_id: session.id,
                subreddit_name: randomSubreddit,
                reddit_post_id: topQuestion.id,
                question_title: topQuestion.title,
                question_content: topQuestion.selftext || null,
                question_author: topQuestion.author,
                generated_answer: finalAnswer,
                reddit_comment_id: commentId,
                status: status,
              });

            if (insertError) {
              console.error(`❌ Database insert error:`, insertError);
            } else {
              console.log(`✅ Saved to database with status: ${status}`);
            }

            // Update session stats
            await supabase
              .from('bot_sessions')
              .update({
                questions_processed: session.questions_processed + 1,
                successful_answers: status === 'posted' ? session.successful_answers + 1 : session.successful_answers,
                error_count: status === 'posted' ? 0 : session.error_count, // Reset error count on success
              })
              .eq('id', session.id);

            const sessionDuration = Date.now() - sessionStartTime;
            console.log(`✅ Session ${session.id} completed in ${sessionDuration}ms - Status: ${status}`);
            
            sessionResults.push({
              sessionId: session.id,
              userId: session.user_id,
              status: status,
              subreddit: randomSubreddit,
              questionTitle: topQuestion.title,
              duration: sessionDuration
            });

            break; // Exit the subreddit loop since we processed a question

          } catch (subredditError) {
            console.error(`❌ Error processing r/${randomSubreddit}:`, subredditError);
            lastError = `Error processing r/${randomSubreddit}: ${subredditError.message}`;
            continue;
          }
        }

        if (!foundQuestion) {
          console.log(`⚠️ No questions processed for user ${session.user_id} after ${attempts} attempts. Last error: ${lastError}`);
          
          // Increment error count but don't disable session immediately
          await supabase
            .from('bot_sessions')
            .update({
              error_count: session.error_count + 1,
            })
            .eq('id', session.id);

          sessionResults.push({
            sessionId: session.id,
            userId: session.user_id,
            status: 'no_questions_found',
            lastError,
            attempts
          });
        }

      } catch (error) {
        console.error(`❌ Error processing session ${session.id}:`, error);
        totalErrors++;
        
        // Update error count
        await supabase
          .from('bot_sessions')
          .update({
            error_count: session.error_count + 1,
          })
          .eq('id', session.id);

        sessionResults.push({
          sessionId: session.id,
          userId: session.user_id,
          status: 'error',
          error: error.message
        });
      }
    }

    const summary = {
      message: 'Bot scheduler completed',
      activeSessions: activeSessions.length,
      processed: totalProcessed,
      errors: totalErrors,
      sessionResults,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Scheduler Summary:`, JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Reddit Bot Scheduler critical error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to detect unanswered questions
function isUnansweredQuestion(title: string, content: string = '', numComments: number = 0) {
  if (numComments > 3) return false;
  
  const text = (title + ' ' + content).toLowerCase().trim();
  
  if (text.length < 10 || text.length > 2000) return false;
  
  const skipPatterns = [
    'upvote', 'downvote', 'karma', 'gold', 'award',
    'mod', 'moderator', 'ban', 'remove',
    'nsfw', 'explicit', 'sexual',
    'political', 'controversial',
    'deleted', '[removed]', '[deleted]',
    'meta', 'subreddit', 'reddit'
  ];
  
  if (skipPatterns.some(pattern => text.includes(pattern))) {
    return false;
  }
  
  if (text.includes('?')) return true;
  
  const questionStarters = [
    'how do i', 'how can i', 'what is', 'why does', 'when should',
    'where can', 'which one', 'who knows', 'what should',
    'can someone explain', 'does anyone know', 'help me understand',
    'looking for advice', 'need help with', 'not sure how',
    'what would', 'how would', 'can anyone', 'does anyone',
    'is there a way', 'what\'s the best', 'how to'
  ];
  
  return questionStarters.some(starter => text.includes(starter));
}
