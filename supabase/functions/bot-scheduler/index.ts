
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { 
    persistSession: false,
    autoRefreshToken: false
  },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔄 Bot scheduler running...');

    // Get all active or paused sessions that are ready to run
    const now = new Date().toISOString();
    const { data: sessions, error } = await supabase
      .from('bot_sessions')
      .select('*')
      .or('status.eq.active,and(status.eq.paused,next_run_time.lte.' + now + ')')
      .eq('is_active', true);

    if (error) {
      console.error('❌ Error fetching sessions:', error);
      throw error;
    }

    console.log(`📋 Found ${sessions?.length || 0} sessions to process`);

    for (const session of sessions || []) {
      try {
        await processSession(session);
      } catch (error) {
        console.error(`❌ Error processing session ${session.id}:`, error);
        
        // Update session with error
        await supabase
          .from('bot_sessions')
          .update({
            error_count: session.error_count + 1,
            last_activity: new Date().toISOString(),
            status: session.error_count >= 5 ? 'error' : session.status,
            pause_reason: session.error_count >= 5 ? 'Too many errors' : session.pause_reason
          })
          .eq('id', session.id);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: sessions?.length || 0,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Bot scheduler error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processSession(session: any) {
  console.log(`🤖 Processing session ${session.id} for user ${session.user_id}`);

  // If session was paused and we're past the next run time, resume it
  if (session.status === 'paused' && session.next_run_time) {
    const nextRunTime = new Date(session.next_run_time);
    if (new Date() >= nextRunTime) {
      console.log(`⏰ Resuming paused session ${session.id}`);
      await supabase
        .from('bot_sessions')
        .update({
          status: 'active',
          next_run_time: null,
          pause_reason: null,
          last_activity: new Date().toISOString()
        })
        .eq('id', session.id);
    } else {
      console.log(`⏸️ Session ${session.id} still paused until ${session.next_run_time}`);
      return;
    }
  }

  // Check daily limits for this user
  const dailyLimits = await checkDailyLimits(session.user_id);
  if (!dailyLimits.canContinue) {
    await pauseSession(session.id, 'daily_limit', dailyLimits.nextAvailable);
    return;
  }

  // Check hourly limits
  const hourlyLimits = await checkHourlyLimits(session.user_id);
  if (!hourlyLimits.canContinue) {
    await pauseSession(session.id, 'hourly_limit', hourlyLimits.nextAvailable);
    return;
  }

  // Get user credentials
  const { data: credentials } = await supabase
    .from('bot_credentials')
    .select('*')
    .eq('user_id', session.user_id)
    .single();

  if (!credentials || !credentials.reddit_client_id || !credentials.gemini_api_key) {
    await pauseSession(session.id, 'missing_credentials', null);
    return;
  }

  // Process one subreddit from the session's subreddit list
  const subreddits = session.subreddit_list || [];
  if (subreddits.length === 0) {
    console.log(`⚠️ No subreddits configured for session ${session.id}`);
    return;
  }

  const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
  console.log(`🔍 Processing r/${randomSubreddit} for session ${session.id}`);

  try {
    // Get questions from Reddit
    const questions = await getRedditQuestions(randomSubreddit, credentials);
    if (!questions || questions.length === 0) {
      console.log(`📭 No questions found in r/${randomSubreddit}`);
      await updateSessionActivity(session.id);
      return;
    }

    // Filter for unanswered questions
    const unansweredQuestions = questions.filter((post: any) => 
      isUnansweredQuestion(post.title, post.selftext, post.num_comments) && 
      post.score >= 2
    );

    if (unansweredQuestions.length === 0) {
      console.log(`⏭️ No unanswered questions in r/${randomSubreddit}`);
      await updateSessionActivity(session.id);
      return;
    }

    // Process the top question
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
      console.log(`✅ Already answered question ${topQuestion.id}`);
      await updateSessionActivity(session.id);
      return;
    }

    // Generate answer
    const answer = await generateAnswer(topQuestion, randomSubreddit, credentials.gemini_api_key);
    if (!answer) {
      throw new Error('Failed to generate answer');
    }

    // Post to Reddit
    const commentId = await postToReddit(topQuestion.id, answer, credentials);

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
        generated_answer: answer,
        reddit_comment_id: commentId,
        status: commentId ? 'posted' : 'failed',
      });

    // Update session stats
    await supabase
      .from('bot_sessions')
      .update({
        questions_processed: session.questions_processed + 1,
        successful_answers: commentId ? session.successful_answers + 1 : session.successful_answers,
        last_activity: new Date().toISOString()
      })
      .eq('id', session.id);

    console.log(`✅ Successfully processed question in r/${randomSubreddit}`);

  } catch (error) {
    console.error(`❌ Error processing r/${randomSubreddit}:`, error);
    throw error;
  }
}

async function checkDailyLimits(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayComments } = await supabase
    .from('questions_answered')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('created_at', today.toISOString());

  const todayCount = todayComments?.length || 0;
  const dailyLimit = 5;

  if (todayCount >= dailyLimit) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { canContinue: false, nextAvailable: tomorrow.toISOString() };
  }

  return { canContinue: true, nextAvailable: null };
}

async function checkHourlyLimits(userId: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { data: hourlyComments } = await supabase
    .from('questions_answered')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('created_at', oneHourAgo.toISOString());

  const hourlyCount = hourlyComments?.length || 0;
  const hourlyLimit = 2;

  if (hourlyCount >= hourlyLimit) {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    return { canContinue: false, nextAvailable: nextHour.toISOString() };
  }

  return { canContinue: true, nextAvailable: null };
}

async function pauseSession(sessionId: string, reason: string, nextRunTime: string | null) {
  console.log(`⏸️ Pausing session ${sessionId}: ${reason} until ${nextRunTime}`);
  
  await supabase
    .from('bot_sessions')
    .update({
      status: 'paused',
      pause_reason: reason,
      next_run_time: nextRunTime,
      last_activity: new Date().toISOString()
    })
    .eq('id', sessionId);
}

async function updateSessionActivity(sessionId: string) {
  await supabase
    .from('bot_sessions')
    .update({
      last_activity: new Date().toISOString()
    })
    .eq('id', sessionId);
}

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

async function getRedditQuestions(subreddit: string, credentials: any) {
  const response = await fetch('https://zxzmomzfmqgesotdhaut.supabase.co/functions/v1/reddit-api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      action: 'getQuestions',
      subredditName: subreddit,
      credentials: credentials
    }),
  });

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`);
  }

  const data = await response.json();
  return data.questions;
}

async function generateAnswer(question: any, subreddit: string, geminiApiKey: string) {
  const response = await fetch('https://zxzmomzfmqgesotdhaut.supabase.co/functions/v1/gemini-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      question: question.selftext || question.title,
      title: question.title,
      subreddit: subreddit,
      apiKey: geminiApiKey
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.answer;
}

async function postToReddit(postId: string, comment: string, credentials: any) {
  const response = await fetch('https://zxzmomzfmqgesotdhaut.supabase.co/functions/v1/reddit-api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      action: 'postComment',
      postId: postId,
      comment: comment,
      credentials: credentials
    }),
  });

  if (!response.ok) {
    throw new Error(`Reddit post error: ${response.status}`);
  }

  const data = await response.json();
  return data.success ? data.commentId : null;
}
