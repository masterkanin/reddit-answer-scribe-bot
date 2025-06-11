
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// Helper function to validate JSON response
const validateJsonResponse = async (response: Response, endpointName: string) => {
  const responseText = await response.text();
  console.log(`${endpointName} response length:`, responseText.length);
  console.log(`${endpointName} first 200 chars:`, responseText.substring(0, 200));
  
  // Check if response is HTML (Reddit web interface)
  if (responseText.includes('<html') || responseText.includes('<body') || responseText.includes('<!DOCTYPE')) {
    throw new Error(`${endpointName} returned HTML instead of JSON - likely hitting web interface instead of API`);
  }
  
  try {
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error(`Failed to parse ${endpointName} response as JSON:`, parseError);
    throw new Error(`${endpointName} returned invalid JSON: ${responseText.substring(0, 100)}`);
  }
};

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

    // Create proper User-Agent string according to Reddit API guidelines
    const userAgent = `script:RedditQABot:v1.0.0 (by /u/${reddit_username})`;
    console.log('Using User-Agent:', userAgent);

    // Enhanced Reddit authentication with better error handling
    const authString = btoa(`${reddit_client_id}:${reddit_client_secret}`);
    const tokenBody = new URLSearchParams({
      'grant_type': 'password',
      'username': reddit_username,
      'password': reddit_password
    });

    console.log('Requesting Reddit access token...');
    
    // Use the correct OAuth token endpoint
    const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Accept': 'application/json',
      },
      body: tokenBody.toString(),
    });

    console.log('Reddit token response status:', tokenResponse.status);
    console.log('Reddit token response headers:', Object.fromEntries(tokenResponse.headers.entries()));

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Reddit auth failed with status:', tokenResponse.status);
      console.error('Reddit auth error response:', errorText);
      
      // Parse the error for better user feedback
      let errorMessage = 'Failed to authenticate with Reddit';
      let errorCode = 'UNKNOWN_ERROR';
      let troubleshootingTips = [];
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error === 'invalid_grant') {
          errorCode = 'INVALID_GRANT';
          errorMessage = 'Invalid Reddit username or password';
          troubleshootingTips = [
            'Double-check your Reddit username and password',
            'If 2FA is enabled, use an app-specific password instead of your regular password',
            'Make sure your Reddit account email is verified',
            'New accounts may need to wait 24 hours before API access is available',
            'Check if your account has been suspended or restricted'
          ];
        } else if (errorData.error === 'unsupported_grant_type') {
          errorCode = 'UNSUPPORTED_GRANT_TYPE';
          errorMessage = 'Reddit app must be configured as "script" type';
          troubleshootingTips = [
            'Go to https://www.reddit.com/prefs/apps/',
            'Make sure your app is configured as "script" type, not "web app"',
            'Verify the redirect URI is set correctly'
          ];
        } else if (errorData.error === 'invalid_client') {
          errorCode = 'INVALID_CLIENT';
          errorMessage = 'Invalid Reddit app credentials';
          troubleshootingTips = [
            'Check that your Client ID and Client Secret are correct',
            'Make sure you copied them exactly from https://www.reddit.com/prefs/apps/',
            'Verify your app configuration is complete'
          ];
        } else {
          errorMessage = `Reddit authentication error: ${errorData.error}`;
        }
      } catch (e) {
        // If we can't parse the error, provide general troubleshooting
        if (tokenResponse.status === 401) {
          errorCode = 'UNAUTHORIZED';
          errorMessage = 'Reddit rejected the credentials';
          troubleshootingTips = [
            'Verify your Reddit username and password are correct',
            'Check if 2FA is enabled and use an app password',
            'Ensure your Reddit account email is verified',
            'New accounts may have temporary API restrictions'
          ];
        } else if (tokenResponse.status === 403) {
          errorCode = 'FORBIDDEN';
          errorMessage = 'Reddit account may be restricted or suspended';
          troubleshootingTips = [
            'Check if your Reddit account is in good standing',
            'Verify your account is not shadowbanned',
            'Make sure your account has sufficient karma/age for API access'
          ];
        }
      }
      
      throw new Error(JSON.stringify({
        message: errorMessage,
        code: errorCode,
        troubleshooting: troubleshootingTips,
        httpStatus: tokenResponse.status,
        rawError: errorText
      }));
    }

    const tokenData = await validateJsonResponse(tokenResponse, 'Token endpoint');
    
    if (!tokenData.access_token) {
      console.error('No access token in Reddit response:', tokenData);
      throw new Error('Reddit did not return an access token');
    }

    const accessToken = tokenData.access_token;
    console.log('Successfully obtained Reddit access token');

    let result;

    if (action === 'testCredentials') {
      console.log('Testing Reddit credentials...');
      
      // Common headers for all OAuth API requests - using correct OAuth domain
      const oauthHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };
      
      // Try multiple endpoints to test API access and gather account information
      const testResults = {
        basicAuth: false,
        userInfo: null,
        accessLevel: 'none',
        accountDetails: null,
        errors: [],
        diagnostics: {
          tokenObtained: true,
          endpointsTested: [],
          responses: {}
        }
      };

      // Test 1: Try Reddit's user info endpoint (most reliable for new accounts)
      try {
        console.log('Testing user info endpoint...');
        const userInfoUrl = 'https://oauth.reddit.com/api/v1/me';
        console.log('Requesting:', userInfoUrl);
        
        const userResponse = await fetch(userInfoUrl, {
          method: 'GET',
          headers: oauthHeaders,
        });

        testResults.diagnostics.endpointsTested.push('me');
        console.log('User info endpoint response status:', userResponse.status);
        console.log('User info endpoint response headers:', Object.fromEntries(userResponse.headers.entries()));

        if (userResponse.ok) {
          try {
            const userData = await validateJsonResponse(userResponse, 'User info endpoint');
            testResults.basicAuth = true;
            testResults.userInfo = userData;
            testResults.accessLevel = 'basic';
            testResults.diagnostics.responses.me = 'success';
            console.log('User info test successful:', userData.name);
          } catch (parseError) {
            console.error('Failed to parse user info response:', parseError);
            testResults.errors.push(`User info endpoint returned invalid response: ${parseError.message}`);
            testResults.diagnostics.responses.me = 'parse_error';
          }
        } else {
          const errorText = await userResponse.text();
          const errorMsg = `User info endpoint failed (${userResponse.status}): ${errorText.substring(0, 200)}`;
          testResults.errors.push(errorMsg);
          testResults.diagnostics.responses.me = `error_${userResponse.status}`;
          console.log('User info endpoint failed:', userResponse.status);
          
          // If we get HTML, it means we're hitting the wrong endpoint
          if (errorText.includes('<html') || errorText.includes('<body')) {
            testResults.errors.push('API calls are being redirected to Reddit web interface - check OAuth configuration');
          }
        }
      } catch (error) {
        const errorMsg = `User info endpoint error: ${error.message}`;
        testResults.errors.push(errorMsg);
        testResults.diagnostics.responses.me = 'network_error';
        console.error('User info endpoint error:', error);
      }

      // Test 2: Try a simpler endpoint for fallback verification
      if (!testResults.basicAuth) {
        try {
          console.log('Testing account preferences endpoint as fallback...');
          const prefsUrl = 'https://oauth.reddit.com/api/v1/me/prefs';
          
          const prefsResponse = await fetch(prefsUrl, {
            method: 'GET',
            headers: oauthHeaders,
          });

          testResults.diagnostics.endpointsTested.push('prefs');
          console.log('Prefs endpoint response status:', prefsResponse.status);

          if (prefsResponse.ok) {
            try {
              await validateJsonResponse(prefsResponse, 'Prefs endpoint');
              testResults.accessLevel = 'prefs';
              testResults.diagnostics.responses.prefs = 'success';
              console.log('Prefs endpoint test successful');
            } catch (parseError) {
              testResults.errors.push(`Prefs endpoint returned invalid response: ${parseError.message}`);
              testResults.diagnostics.responses.prefs = 'parse_error';
            }
          } else {
            const errorText = await prefsResponse.text();
            testResults.errors.push(`Prefs endpoint failed (${prefsResponse.status}): ${errorText.substring(0, 200)}`);
            testResults.diagnostics.responses.prefs = `error_${prefsResponse.status}`;
          }
        } catch (error) {
          testResults.errors.push(`Prefs endpoint error: ${error.message}`);
          testResults.diagnostics.responses.prefs = 'network_error';
          console.error('Prefs endpoint error:', error);
        }
      }

      // Determine overall result and provide detailed feedback
      if (testResults.basicAuth && testResults.userInfo) {
        result = { 
          success: true, 
          message: 'Reddit credentials are working correctly!',
          userData: {
            name: testResults.userInfo.name,
            id: testResults.userInfo.id,
            created_utc: testResults.userInfo.created_utc,
            link_karma: testResults.userInfo.link_karma || 0,
            comment_karma: testResults.userInfo.comment_karma || 0,
            has_verified_email: testResults.userInfo.has_verified_email || false,
            is_suspended: testResults.userInfo.is_suspended || false
          },
          accessLevel: testResults.accessLevel,
          diagnostics: testResults.diagnostics
        };
      } else {
        // Provide detailed diagnostic information
        let errorMessage = 'Reddit API test failed';
        let troubleshootingTips = [
          'Your Reddit app configuration may be incorrect',
          'Go to https://www.reddit.com/prefs/apps/ and verify your app is set as "script" type',
          'Make sure your Client ID and Client Secret are copied correctly',
          'Check that your Reddit username and password are correct',
          'If using 2FA, create an app-specific password',
          'New Reddit accounts may need 24-48 hours before API access works',
          'Ensure your Reddit account email is verified'
        ];

        if (testResults.errors.some(e => e.includes('HTML'))) {
          errorMessage = 'Reddit API calls are being redirected to web interface';
          troubleshootingTips = [
            'Your Reddit app is likely configured incorrectly',
            'Go to https://www.reddit.com/prefs/apps/',
            'Delete your current app and create a new one',
            'Select "script" as the app type (NOT web app)',
            'Set redirect URI to http://localhost:8080',
            'Copy the Client ID (under the app name) and Client Secret correctly'
          ];
        }

        if (testResults.errors.length > 0) {
          errorMessage += `. Errors: ${testResults.errors.slice(0, 2).join('; ')}`;
        }

        result = {
          success: false,
          message: errorMessage,
          code: 'API_TEST_FAILED',
          troubleshooting: troubleshootingTips,
          diagnostics: testResults.diagnostics
        };
      }

    } else if (action === 'getQuestions') {
      console.log(`Fetching posts from r/${subredditName}`);
      
      // Get new posts from subreddit with enhanced error handling
      const subredditUrl = `https://oauth.reddit.com/r/${subredditName}/new.json?limit=25`;
      console.log('Requesting URL:', subredditUrl);
      
      const response = await fetch(subredditUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': userAgent,
          'Accept': 'application/json',
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

      const data = await validateJsonResponse(response, 'Subreddit endpoint');
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
          'User-Agent': userAgent,
          'Accept': 'application/json',
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

      const data = await validateJsonResponse(response, 'Comment endpoint');
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
    
    // Parse structured error messages
    let errorResponse = { 
      error: error.message,
      details: 'Check the function logs for more information'
    };
    
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError.code) {
        errorResponse = parsedError;
      }
    } catch (e) {
      // Not a structured error, use the original message
    }
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
