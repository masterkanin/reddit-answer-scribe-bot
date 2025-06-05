
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    const { action, subredditName, postId, comment } = await req.json();

    // Get user's Reddit credentials
    const { data: credentials, error: credError } = await supabase
      .from('bot_credentials')
      .select('reddit_client_id, reddit_client_secret, reddit_username, reddit_password')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Reddit credentials not found');
    }

    const { reddit_client_id, reddit_client_secret, reddit_username, reddit_password } = credentials;

    if (!reddit_client_id || !reddit_client_secret || !reddit_username || !reddit_password) {
      throw new Error('Incomplete Reddit credentials');
    }

    // Get Reddit access token
    const authString = btoa(`${reddit_client_id}:${reddit_client_secret}`);
    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedditQABot/1.0.0',
      },
      body: `grant_type=password&username=${reddit_username}&password=${reddit_password}`,
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Reddit access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    let result;

    if (action === 'getQuestions') {
      // Get new posts from subreddit
      const response = await fetch(`https://oauth.reddit.com/r/${subredditName}/new.json?limit=25`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'RedditQABot/1.0.0',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subreddit posts');
      }

      const data = await response.json();
      const posts = data.data.children.map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        selftext: child.data.selftext,
        author: child.data.author,
        created_utc: child.data.created_utc,
        num_comments: child.data.num_comments,
        score: child.data.score,
        permalink: child.data.permalink,
      }));

      // Filter for questions (posts with question marks or common question words)
      const questions = posts.filter((post: any) => {
        const text = (post.title + ' ' + post.selftext).toLowerCase();
        return (
          text.includes('?') ||
          text.includes('how ') ||
          text.includes('what ') ||
          text.includes('why ') ||
          text.includes('when ') ||
          text.includes('where ') ||
          text.includes('which ') ||
          text.includes('who ')
        );
      });

      result = { questions };

    } else if (action === 'postComment') {
      // Post a comment to a Reddit post
      const response = await fetch('https://oauth.reddit.com/api/comment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RedditQABot/1.0.0',
        },
        body: `thing_id=t3_${postId}&text=${encodeURIComponent(comment)}`,
      });

      if (!response.ok) {
        throw new Error('Failed to post comment');
      }

      const data = await response.json();
      result = { success: true, commentId: data.json?.data?.things?.[0]?.data?.id };

    } else {
      throw new Error('Invalid action');
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reddit API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
