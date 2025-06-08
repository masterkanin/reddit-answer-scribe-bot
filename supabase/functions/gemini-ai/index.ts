
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
    console.log('🤖 Gemini AI function called');
    
    // Enhanced authentication debugging
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('❌ Missing authorization header');
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Token length:', token.length);
    console.log('Token prefix:', token.substring(0, 20) + '...');

    // Create Supabase client with enhanced configuration
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
    });

    // Step 1: Authenticate user and get user info
    console.log('🔐 Step 1: Authenticating user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError) {
      console.error('❌ User authentication error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }

    if (!user) {
      console.error('❌ No user found in token');
      throw new Error('Invalid user token - no user found');
    }

    console.log('✅ User authenticated successfully');
    console.log('User ID:', user.id);
    console.log('User email:', user.email);

    // Step 2: Set the auth session on the client
    console.log('🔑 Step 2: Setting auth session...');
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: '',
    });

    if (sessionError) {
      console.error('❌ Failed to set auth session:', sessionError);
      throw new Error(`Session setup failed: ${sessionError.message}`);
    }

    console.log('✅ Auth session set on Supabase client');

    // Step 3: Get request data
    const { question, title, subreddit } = await req.json();
    console.log('📝 Request data:', { 
      hasQuestion: !!question, 
      hasTitle: !!title, 
      subreddit: subreddit 
    });

    // Step 4: Enhanced credentials retrieval with multiple attempts
    console.log('🔍 Step 4: Fetching Gemini API key for user:', user.id);
    
    let credentials = null;
    let credError = null;

    // First attempt: Standard query with detailed logging
    console.log('🔍 Attempt 1: Standard query...');
    const result1 = await supabase
      .from('bot_credentials')
      .select('gemini_api_key, user_id, created_at, updated_at')
      .eq('user_id', user.id);

    console.log('Query result 1:', {
      data: result1.data,
      error: result1.error,
      count: result1.data?.length || 0
    });

    if (result1.error) {
      credError = result1.error;
      console.error('❌ First query failed:', result1.error);
    } else if (result1.data && result1.data.length > 0) {
      credentials = result1.data[0];
      console.log('✅ Credentials found on first attempt');
    }

    // Second attempt: If first failed, try with a fresh client instance
    if (!credentials && !credError) {
      console.log('🔍 Attempt 2: Fresh client query...');
      
      // Create a completely fresh client instance
      const freshSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      // Re-authenticate with the fresh client
      await freshSupabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      });

      const result2 = await freshSupabase
        .from('bot_credentials')
        .select('gemini_api_key, user_id, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      console.log('Query result 2:', {
        data: result2.data,
        error: result2.error
      });

      if (result2.error) {
        // If it's just "no rows" error, that's expected, not a real error
        if (result2.error.code === 'PGRST116') {
          console.log('ℹ️ No credentials found (expected error code)');
        } else {
          credError = result2.error;
          console.error('❌ Second query failed:', result2.error);
        }
      } else if (result2.data) {
        credentials = result2.data;
        console.log('✅ Credentials found on second attempt');
      }
    }

    // Step 5: Process results
    console.log('📊 Final credentials check:', {
      hasCredentials: !!credentials,
      hasError: !!credError,
      errorMessage: credError?.message,
      credentialsUserId: credentials?.user_id,
      requestUserId: user.id,
      userIdMatch: credentials?.user_id === user.id,
      hasGeminiKey: !!credentials?.gemini_api_key,
      geminiKeyLength: credentials?.gemini_api_key?.length || 0
    });

    if (credError) {
      console.error('❌ Database error fetching credentials:', credError);
      throw new Error(`Database error: ${credError.message}`);
    }

    if (!credentials) {
      console.error('❌ No credentials record found for user:', user.id);
      throw new Error('No bot credentials found for this user. Please configure your Gemini API key first.');
    }

    if (!credentials.gemini_api_key) {
      console.error('❌ Gemini API key is null/empty in database');
      throw new Error('Gemini API key not configured. Please add your API key in settings.');
    }

    console.log('✅ Gemini API key found successfully');
    console.log('Key length:', credentials.gemini_api_key.length);
    console.log('Key prefix:', credentials.gemini_api_key.substring(0, 10) + '...');
    
    const geminiApiKey = credentials.gemini_api_key;

    // Step 6: Prepare the prompt for Gemini
    const prompt = `You are a helpful assistant answering questions on Reddit in r/${subreddit}. 

Question Title: ${title}
Question: ${question}

Please provide a helpful, accurate, and well-formatted answer. Keep it concise but informative. Use a friendly, conversational tone that fits Reddit's culture. If the question is complex, break down your answer into clear points. Avoid being overly formal or corporate-sounding.

Important guidelines:
- Be factual and accurate
- Acknowledge if you're uncertain about something
- Use line breaks for readability
- Keep it under 500 words unless the question really needs a longer answer
- Don't mention that you're an AI unless specifically relevant`;

    console.log('🤖 Calling Gemini API...');
    
    // Step 7: Call Gemini API
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    console.log('Gemini API response status:', geminiResponse.status);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini API error response:', errorText);
      
      if (geminiResponse.status === 400 && errorText.includes('API_KEY_INVALID')) {
        throw new Error('Invalid Gemini API key. Please check your API key in settings.');
      }
      
      throw new Error(`Gemini API error (${geminiResponse.status}): ${errorText}`);
    }

    const data = await geminiResponse.json();
    console.log('Gemini API response structure:', {
      hasCandidates: !!data.candidates,
      candidatesCount: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      hasParts: !!data.candidates?.[0]?.content?.parts
    });
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ No content in Gemini response:', JSON.stringify(data, null, 2));
      throw new Error('No content generated by Gemini - the response was empty or malformed');
    }

    const generatedAnswer = data.candidates[0].content.parts[0].text;
    console.log('✅ Generated answer successfully');
    console.log('Answer length:', generatedAnswer.length);
    console.log('Answer preview:', generatedAnswer.substring(0, 100) + '...');

    return new Response(JSON.stringify({ answer: generatedAnswer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Gemini AI function error:', error.message);
    console.error('Full error details:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check the function logs for more information',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
