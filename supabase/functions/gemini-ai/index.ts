
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
    
    const { question, title, subreddit, apiKey } = await req.json();
    console.log('📝 Request data:', { 
      hasQuestion: !!question, 
      hasTitle: !!title, 
      subreddit: subreddit 
    });

    let geminiApiKey = apiKey;

    // If no API key provided, try to get from auth header and database
    if (!geminiApiKey) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('Missing authorization header or API key');
      }

      const token = authHeader.replace('Bearer ', '');
      
      // Check if this is the service role key (from scheduler)
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (token === serviceRoleKey) {
        // For service role calls, the API key should be in the request body
        if (!apiKey) {
          throw new Error('API key required for service role calls');
        }
        geminiApiKey = apiKey;
      } else {
        // For user calls, authenticate and get API key from database
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { 
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          },
        });

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          throw new Error('Authentication failed');
        }

        const adminSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
          auth: { 
            persistSession: false,
            autoRefreshToken: false
          },
        });

        const { data: credentials, error: credError } = await adminSupabase
          .from('bot_credentials')
          .select('gemini_api_key')
          .eq('user_id', user.id)
          .single();

        if (credError || !credentials?.gemini_api_key) {
          throw new Error('Gemini API key not configured');
        }

        geminiApiKey = credentials.gemini_api_key;
      }
    }

    // Prepare the prompt for Gemini
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
    
    // Call Gemini API
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

    // Add bot disclaimer
    const botDisclaimer = "\n\n---\n*I'm an automated helper bot. This response was generated by AI to help answer your question.*";
    const finalAnswer = generatedAnswer + botDisclaimer;

    return new Response(JSON.stringify({ answer: finalAnswer }), {
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
