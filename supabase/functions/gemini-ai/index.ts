
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

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('❌ Missing authorization header');
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Token length:', token.length);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError) {
      console.error('❌ User authentication error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }

    if (!user) {
      console.error('❌ No user found in token');
      throw new Error('Invalid user token - no user found');
    }

    console.log('✅ User authenticated:', user.id);

    const { question, title, subreddit } = await req.json();
    console.log('Request data:', { 
      hasQuestion: !!question, 
      hasTitle: !!title, 
      subreddit: subreddit 
    });

    // Get user's Gemini API key with improved error handling
    console.log('🔍 Fetching Gemini API key for user:', user.id);
    
    const { data: credentials, error: credError } = await supabase
      .from('bot_credentials')
      .select('gemini_api_key')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('Database query result:', {
      hasData: !!credentials,
      hasError: !!credError,
      errorMessage: credError?.message
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

    console.log('✅ Gemini API key found, length:', credentials.gemini_api_key.length);
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
    
    // Call Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
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

    console.log('Gemini API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error response:', errorText);
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini API response structure:', {
      hasCandidates: !!data.candidates,
      candidatesCount: data.candidates?.length || 0
    });
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ No content in Gemini response:', JSON.stringify(data, null, 2));
      throw new Error('No content generated by Gemini - the response was empty or malformed');
    }

    const generatedAnswer = data.candidates[0].content.parts[0].text;
    console.log('✅ Generated answer length:', generatedAnswer.length);

    return new Response(JSON.stringify({ answer: generatedAnswer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Gemini AI function error:', error.message);
    console.error('Full error details:', error);
    
    // Return detailed error information
    return new Response(JSON.stringify({ 
      error: error.message,
      details: 'Check the function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
