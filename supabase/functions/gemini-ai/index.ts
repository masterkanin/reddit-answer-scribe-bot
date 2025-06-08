
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
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('❌ Missing authorization header');
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Token length:', token.length);

    // Create Supabase client for authentication
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
    });

    // Step 1: Authenticate user
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

    // Step 2: Get request data
    const { question, title, subreddit } = await req.json();
    console.log('📝 Request data:', { 
      hasQuestion: !!question, 
      hasTitle: !!title, 
      subreddit: subreddit 
    });

    // Step 3: Use service role key to fetch credentials directly
    console.log('🔑 Step 3: Creating admin client for credential access...');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseServiceKey) {
      console.error('❌ Missing service role key');
      throw new Error('Service configuration error');
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { 
        persistSession: false,
        autoRefreshToken: false
      },
    });

    // Step 4: Fetch credentials using admin client (bypassing RLS)
    console.log('🔍 Step 4: Fetching Gemini API key for user:', user.id);
    
    const { data: credentials, error: credError } = await adminSupabase
      .from('bot_credentials')
      .select('gemini_api_key, user_id, created_at, updated_at')
      .eq('user_id', user.id)
      .single();

    console.log('Credentials query result:', {
      hasData: !!credentials,
      hasError: !!credError,
      errorMessage: credError?.message,
      errorCode: credError?.code
    });

    if (credError) {
      if (credError.code === 'PGRST116') {
        console.error('❌ No credentials found for user:', user.id);
        throw new Error('No bot credentials found for this user. Please configure your Gemini API key first.');
      } else {
        console.error('❌ Database error fetching credentials:', credError);
        throw new Error(`Database error: ${credError.message}`);
      }
    }

    if (!credentials || !credentials.gemini_api_key) {
      console.error('❌ Gemini API key is null/empty in database');
      throw new Error('Gemini API key not configured. Please add your API key in settings.');
    }

    console.log('✅ Gemini API key found successfully');
    console.log('Key length:', credentials.gemini_api_key.length);
    
    const geminiApiKey = credentials.gemini_api_key;

    // Step 5: Prepare the prompt for Gemini
    const prompt = `You are a helpful assistant answering questions on Reddit in r/${subreddit}. 

Question Title: ${title}
Question: ${question}

Please provide a helpful, accurate answer. Write in a conversational tone that fits Reddit's culture. Keep your response to maximum 10 lines. Do NOT use bullet points or numbered lists. Write in paragraph format with natural flow.

At the end of your response, add a brief summary line starting with "TL;DR:" that captures the main point in one sentence.

Guidelines:
- Be factual and acknowledge uncertainty when needed
- Keep it concise and under 10 lines
- Use natural paragraph format, no bullet points
- End with a TL;DR summary
- Don't mention that you're an AI unless specifically relevant`;

    console.log('🤖 Calling Gemini API with model: gemini-1.5-flash...');
    
    // Step 6: Call Gemini API with the correct model name
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
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
