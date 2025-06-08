
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
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

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

    // Get user with enhanced error handling
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError) {
      console.error('❌ User authentication error:', userError);
      console.error('Error code:', userError.status);
      console.error('Error message:', userError.message);
      throw new Error(`Authentication failed: ${userError.message}`);
    }

    if (!user) {
      console.error('❌ No user found in token');
      throw new Error('Invalid user token - no user found');
    }

    console.log('✅ User authenticated successfully');
    console.log('User ID:', user.id);
    console.log('User email:', user.email);
    console.log('User created at:', user.created_at);

    const { question, title, subreddit } = await req.json();
    console.log('Request data:', { 
      hasQuestion: !!question, 
      hasTitle: !!title, 
      subreddit: subreddit 
    });

    // Enhanced database query with better debugging
    console.log('🔍 Fetching Gemini API key for user:', user.id);
    
    // First, check if user exists in bot_credentials table at all
    const { data: userCheck, error: userCheckError } = await supabase
      .from('bot_credentials')
      .select('user_id')
      .eq('user_id', user.id);

    console.log('User existence check:', {
      found: userCheck?.length || 0,
      error: userCheckError?.message,
      userId: user.id
    });

    if (userCheckError) {
      console.error('❌ Database error checking user existence:', userCheckError);
      throw new Error(`Database error: ${userCheckError.message}`);
    }

    // Now get the credentials with enhanced error handling
    const { data: credentials, error: credError } = await supabase
      .from('bot_credentials')
      .select('gemini_api_key, user_id, created_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('Credentials query result:', {
      hasData: !!credentials,
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
      
      // Try to get all records for debugging (remove user filter)
      const { data: allCreds, error: allCredsError } = await supabase
        .from('bot_credentials')
        .select('user_id')
        .limit(5);
      
      console.log('Debug - Sample user IDs in bot_credentials:', allCreds?.map(c => c.user_id));
      
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

    // Prepare the prompt for Gemini
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
    
    // Call Gemini API with enhanced error handling
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
    console.log('Gemini API response headers:', Object.fromEntries(geminiResponse.headers.entries()));

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini API error response:', errorText);
      
      // Check for specific API key errors
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
    console.error('Error stack:', error.stack);
    
    // Return detailed error information for debugging
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
