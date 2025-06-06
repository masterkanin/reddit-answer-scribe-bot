
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
    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      throw new Error('Missing authorization header');
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');
    console.log('Received auth token, length:', token.length);

    // Create Supabase client with the user's token for RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Verify user authentication and get user info
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Invalid user token:', userError);
      throw new Error('Invalid user token');
    }

    console.log('Authenticated user:', user.id);

    const { action, subredditName, postId, comment } = await req.json();
    console.log('Action:', action, 'Subreddit:', subredditName, 'User ID:', user.id);

    // Get user's Reddit credentials using the authenticated client
    console.log('Fetching Reddit credentials for user:', user.id);
    const { data: credentials, error: credError } = await supabase
      .from('bot_credentials')
      .select('reddit_client_id, reddit_client_secret, reddit_username, reddit_password')
      .eq('user_id', user.id)
      .maybeSingle();

    if (credError) {
      console.error('Error fetching credentials:', credError);
      throw new Error(`Database error fetching Reddit credentials: ${credError.message}`);
    }

    if (!credentials) {
      console.error('No Reddit credentials found for user:', user.id);
      throw new Error('Reddit credentials not found. Please configure your Reddit API credentials first.');
    }

    console.log('Successfully fetched credentials for user:', user.id);
    console.log('Credentials check:', {
      hasClientId: !!credentials.reddit_client_id,
      hasClientSecret: !!credentials.reddit_client_secret,
      hasUsername: !!credentials.reddit_username,
      hasPassword: !!credentials.reddit_password
    });

    const { reddit_client_id, reddit_client_secret, reddit_username, reddit_password } = credentials;

    if (!reddit_client_id || !reddit_client_secret || !reddit_username || !reddit_password) {
      console.error('Incomplete Reddit credentials for user:', user.id);
      console.error('Missing fields:', {
        client_id: !reddit_client_id,
        client_secret: !reddit_client_secret,
        username: !reddit_username,
        password: !reddit_password
      });
      throw new Error('Incomplete Reddit credentials. Please ensure all fields are filled in the Reddit connection settings.');
    }

    console.log('Reddit credentials validated, attempting authentication...');

    // Enhanced Reddit authentication with better error handling
    const authString = btoa(`${reddit_client_id}:${reddit_client_secret}`);
    const tokenBody = new URLSearchParams({
      'grant_type': 'password',
      'username': reddit_username,
      'password': reddit_password
    });

    console.log('Requesting Reddit access token...');
    
    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RedditQABot:v1.0.0 (by /u/' + reddit_username + ')',
      },
      body: tokenBody.toString(),
    });

    console.log('Reddit token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Reddit auth failed with status:', tokenResponse.status);
      console.error('Reddit auth error response:', errorText);
      
      // Parse the error for better user feedback
      let errorMessage = 'Failed to authenticate with Reddit';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error === 'invalid_grant') {
          errorMessage = 'Invalid Reddit username or password. Please check your credentials.';
        } else if (errorData.error === 'unsupported_grant_type') {
          errorMessage = 'Reddit app must be configured as "script" type. Please check your app settings at https://www.reddit.com/prefs/apps/';
        } else {
          errorMessage = `Reddit authentication error: ${errorData.error}`;
        }
      } catch (e) {
        // If we can't parse the error, use the raw response
        errorMessage = `Reddit authentication failed: ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      console.error('No access token in Reddit response:', tokenData);
      throw new Error('Reddit did not return an access token');
    }

    const accessToken = tokenData.access_token;
    console.log('Successfully obtained Reddit access token');

    let result;

    if (action === 'getQuestions') {
      console.log(`Fetching posts from r/${subredditName}`);
      
      // Get new posts from subreddit with enhanced error handling
      const subredditUrl = `https://oauth.reddit.com/r/${subredditName}/new.json?limit=25`;
      console.log('Requesting URL:', subredditUrl);
      
      const response = await fetch(subredditUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'RedditQABot:v1.0.0 (by /u/' + reddit_username + ')',
        },
      });

      console.log('Subreddit response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch r/${subredditName} with status:`, response.status);
        console.error('Subreddit error response:', errorText);
        
        let errorMessage = `Failed to fetch posts from r/${subredditName}`;
        if (response.status === 403) {
          errorMessage = `Access denied to r/${subredditName}. The subreddit might be private or your account may not have access.`;
        } else if (response.status === 404) {
          errorMessage = `Subreddit r/${subredditName} not found.`;
        } else if (response.status === 429) {
          errorMessage = `Rate limited by Reddit. Please wait before trying again.`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log(`Successfully fetched data from r/${subredditName}`);
      console.log(`Found ${data.data?.children?.length || 0} posts`);
      
      if (!data.data || !data.data.children) {
        console.error('Unexpected Reddit API response structure:', data);
        throw new Error('Unexpected response format from Reddit API');
      }
      
      const posts = data.data.children.map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        selftext: child.data.selftext,
        author: child.data.author,
        created_utc: child.data.created_utc,
        num_comments: child.data.num_comments,
        score: child.data.score,
        permalink: child.data.permalink,
        url: child.data.url,
      }));

      result = { questions: posts };
      console.log(`Returning ${posts.length} posts for processing`);

    } else if (action === 'postComment') {
      console.log(`Posting comment to post ${postId}`);
      
      const commentBody = new URLSearchParams({
        'thing_id': `t3_${postId}`,
        'text': comment
      });
      
      const response = await fetch('https://oauth.reddit.com/api/comment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RedditQABot:v1.0.0 (by /u/' + reddit_username + ')',
        },
        body: commentBody.toString(),
      });

      console.log('Comment response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to post comment with status:', response.status);
        console.error('Comment error response:', errorText);
        
        let errorMessage = 'Failed to post comment';
        if (response.status === 403) {
          errorMessage = 'Access denied. You may not have permission to comment in this subreddit.';
        } else if (response.status === 429) {
          errorMessage = 'Rate limited by Reddit. Please wait before posting again.';
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Comment response data:', JSON.stringify(data, null, 2));
      
      const commentId = data.json?.data?.things?.[0]?.data?.id;
      result = { success: true, commentId };
      console.log(`Successfully posted comment with ID: ${commentId}`);

    } else {
      throw new Error(`Invalid action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reddit API error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check the function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
