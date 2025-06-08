
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🤖 Reddit Bot Scheduler triggered');

    // Create admin Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false
      },
    });

    // Get all active bot sessions
    const { data: activeSessions, error: sessionsError } = await supabase
      .from('bot_sessions')
      .select(`
        *,
        profiles!inner(id, email)
      `)
      .eq('is_active', true);

    if (sessionsError) {
      console.error('Error fetching active sessions:', sessionsError);
      throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
    }

    console.log(`Found ${activeSessions?.length || 0} active bot sessions`);

    if (!activeSessions || activeSessions.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No active bot sessions found',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalProcessed = 0;

    // Process each active session
    for (const session of activeSessions) {
      try {
        console.log(`Processing session ${session.id} for user ${session.user_id}`);
        
        // Check daily limits for this user
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: todayComments } = await supabase
          .from('questions_answered')
          .select('id')
          .eq('user_id', session.user_id)
          .eq('status', 'posted')
          .gte('created_at', today.toISOString());

        const dailyCount = todayComments?.length || 0;
        const DAILY_LIMIT = 5;

        if (dailyCount >= DAILY_LIMIT) {
          console.log(`User ${session.user_id} has reached daily limit (${dailyCount}/${DAILY_LIMIT})`);
          continue;
        }

        // Check hourly limit
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const { data: hourlyComments } = await supabase
          .from('questions_answered')
          .select('id')
          .eq('user_id', session.user_id)
          .eq('status', 'posted')
          .gte('created_at', oneHourAgo.toISOString());

        const hourlyCount = hourlyComments?.length || 0;
        const HOURLY_LIMIT = 2;

        if (hourlyCount >= HOURLY_LIMIT) {
          console.log(`User ${session.user_id} has reached hourly limit (${hourlyCount}/${HOURLY_LIMIT})`);
          continue;
        }

        // Get user's monitored subreddits (fallback to default ones)
        const { data: monitoredSubreddits } = await supabase
          .from('subreddit_monitoring')
          .select('subreddit_name')
          .eq('user_id', session.user_id)
          .eq('is_active', true);

        const subreddits = monitoredSubreddits?.map(s => s.subreddit_name) || 
                          ['AskReddit', 'explainlikeimfive', 'NoStupidQuestions'];

        // Pick a random subreddit for this cycle
        const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
        
        console.log(`Checking r/${randomSubreddit} for user ${session.user_id}`);

        // Create user JWT token for API calls
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(session.user_id);
        
        if (userError || !user) {
          console.error(`Error getting user ${session.user_id}:`, userError);
          continue;
        }

        // Create a temporary session token for this user
        const { data: authData, error: authError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: user.email!,
        });

        if (authError) {
          console.error(`Error generating auth token for user ${session.user_id}:`, authError);
          continue;
        }

        // Use the service role key to call reddit-api function directly
        const redditResponse = await fetch(`${supabaseUrl}/functions/v1/reddit-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'getQuestions',
            subredditName: randomSubreddit,
            userId: session.user_id, // Pass user ID for credential lookup
          }),
        });

        if (!redditResponse.ok) {
          const errorText = await redditResponse.text();
          console.error(`Reddit API error for user ${session.user_id}:`, errorText);
          continue;
        }

        const { questions } = await redditResponse.json();
        
        if (!questions || questions.length === 0) {
          console.log(`No posts found in r/${randomSubreddit} for user ${session.user_id}`);
          continue;
        }

        // Filter for unanswered questions
        const unansweredQuestions = questions.filter((post: any) => 
          isUnansweredQuestion(post.title, post.selftext, post.num_comments) && 
          post.score >= 2
        );
        
        if (unansweredQuestions.length === 0) {
          console.log(`No unanswered questions in r/${randomSubreddit} for user ${session.user_id}`);
          continue;
        }

        // Get the top question
        const topQuestion = unansweredQuestions
          .sort((a: any, b: any) => b.score - a.score)[0];

        // Check if already answered
        const { data: existing } = await supabase
          .from('questions_answered')
          .select('id')
          .eq('reddit_post_id', topQuestion.id)
          .eq('user_id', session.user_id)
          .maybeSingle();

        if (existing) {
          console.log(`Question ${topQuestion.id} already answered by user ${session.user_id}`);
          continue;
        }

        console.log(`Processing question: "${topQuestion.title}" for user ${session.user_id}`);

        // Generate answer with Gemini
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

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error(`Gemini API error for user ${session.user_id}:`, errorText);
          continue;
        }

        const { answer } = await geminiResponse.json();
        if (!answer) {
          console.error(`No answer generated for user ${session.user_id}`);
          continue;
        }

        // Add bot disclaimer
        const BOT_DISCLAIMER = "\n\n---\n*I'm an automated helper bot. This response was generated by AI to help answer your question.*";
        const finalAnswer = answer + BOT_DISCLAIMER;

        // Wait random delay (2-4 minutes for compliance)
        const delay = Math.floor(Math.random() * (240000 - 120000 + 1)) + 120000; // 2-4 minutes
        console.log(`Waiting ${delay/1000}s before posting for user ${session.user_id}...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Post comment
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

        let commentId = null;
        let status = 'failed';

        if (commentResponse.ok) {
          const commentData = await commentResponse.json();
          if (commentData.success) {
            commentId = commentData.commentId;
            status = 'posted';
            console.log(`Successfully posted comment for user ${session.user_id}: ${commentId}`);
            totalProcessed++;
          }
        } else {
          const errorText = await commentResponse.text();
          console.error(`Failed to post comment for user ${session.user_id}:`, errorText);
        }

        // Save to database
        await supabase
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

        // Update session stats
        await supabase
          .from('bot_sessions')
          .update({
            questions_processed: session.questions_processed + 1,
            successful_answers: status === 'posted' ? session.successful_answers + 1 : session.successful_answers,
          })
          .eq('id', session.id);

        console.log(`Completed processing for user ${session.user_id} - Status: ${status}`);

      } catch (error) {
        console.error(`Error processing session ${session.id}:`, error);
        
        // Update error count
        await supabase
          .from('bot_sessions')
          .update({
            error_count: session.error_count + 1,
          })
          .eq('id', session.id);
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Bot scheduler completed',
      activeSessions: activeSessions.length,
      processed: totalProcessed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reddit Bot Scheduler error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to detect unanswered questions
function isUnansweredQuestion(title: string, content: string = '', numComments: number = 0) {
  if (numComments > 2) return false;
  
  const text = (title + ' ' + content).toLowerCase().trim();
  
  if (text.length < 20 || text.length > 1500) return false;
  
  const skipPatterns = [
    'upvote', 'downvote', 'karma', 'gold', 'award',
    'mod', 'moderator', 'ban', 'remove',
    'nsfw', 'explicit', 'sexual',
    'political', 'controversial', 'opinion',
    'best', 'worst', 'favorite', 'hate'
  ];
  
  if (skipPatterns.some(pattern => text.includes(pattern))) {
    return false;
  }
  
  if (text.includes('?')) return true;
  
  const questionStarters = [
    'how do i', 'how can i', 'what is', 'why does', 'when should',
    'where can', 'which one', 'who knows', 'what should',
    'can someone explain', 'does anyone know', 'help me understand',
    'looking for advice', 'need help with', 'not sure how'
  ];
  
  return questionStarters.some(starter => text.includes(starter));
}
