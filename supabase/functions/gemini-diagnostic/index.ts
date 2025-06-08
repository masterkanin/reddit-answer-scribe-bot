
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
    console.log('🔍 Starting Gemini diagnostic...');
    
    const results: any = {
      step1_auth_header: null,
      step2_supabase_client: null,
      step3_user_auth: null,
      step4_auth_session_set: null,
      step5_db_connection: null,
      step6_credentials_query: null,
      step7_raw_query: null,
    };

    // Step 1: Check auth header
    const authHeader = req.headers.get('Authorization');
    results.step1_auth_header = {
      present: !!authHeader,
      length: authHeader?.length || 0,
      prefix: authHeader?.substring(0, 20) + '...',
    };
    console.log('Step 1 - Auth header:', results.step1_auth_header);

    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Step 2: Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    results.step2_supabase_client = {
      created: true,
      url: supabaseUrl.substring(0, 30) + '...',
      key_length: supabaseAnonKey.length,
    };
    console.log('Step 2 - Supabase client:', results.step2_supabase_client);

    // Step 3: Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    results.step3_user_auth = {
      success: !userError && !!user,
      user_id: user?.id || null,
      email: user?.email || null,
      error: userError?.message || null,
    };
    console.log('Step 3 - User auth:', results.step3_user_auth);

    if (userError || !user) {
      throw new Error(`User auth failed: ${userError?.message}`);
    }

    // Step 4: Set auth session (NEW STEP)
    try {
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      });
      results.step4_auth_session_set = {
        success: true,
        error: null,
      };
      console.log('Step 4 - Auth session set successfully');
    } catch (sessionError) {
      results.step4_auth_session_set = {
        success: false,
        error: sessionError.message,
      };
      console.error('Step 4 - Failed to set auth session:', sessionError);
    }

    // Step 5: Test basic database connection
    const { data: testData, error: testError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    results.step5_db_connection = {
      success: !testError,
      error: testError?.message || null,
      profiles_accessible: !!testData,
    };
    console.log('Step 5 - DB connection:', results.step5_db_connection);

    // Step 6: Try to query bot_credentials with auth context
    console.log('Step 6 - Attempting bot_credentials query with auth context for user:', user.id);
    
    const { data: credentials, error: credError } = await supabase
      .from('bot_credentials')
      .select('user_id, gemini_api_key, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    results.step6_credentials_query = {
      success: !credError,
      has_data: !!credentials,
      user_id_match: credentials?.user_id === user.id,
      has_gemini_key: !!credentials?.gemini_api_key,
      gemini_key_length: credentials?.gemini_api_key?.length || 0,
      created_at: credentials?.created_at || null,
      error: credError?.message || null,
    };
    console.log('Step 6 - Credentials query with auth context:', results.step6_credentials_query);

    // Step 7: Raw query to check if ANY records exist (for debugging)
    const { data: allCreds, error: allCredsError } = await supabase
      .from('bot_credentials')
      .select('user_id, created_at')
      .limit(5);
    
    results.step7_raw_query = {
      success: !allCredsError,
      total_records: allCreds?.length || 0,
      sample_user_ids: allCreds?.map(c => c.user_id) || [],
      target_user_id: user.id,
      user_id_exists_in_table: allCreds?.some(c => c.user_id === user.id) || false,
      error: allCredsError?.message || null,
    };
    console.log('Step 7 - Raw query:', results.step7_raw_query);

    // Final analysis
    const analysis = {
      auth_working: results.step3_user_auth.success,
      auth_session_set: results.step4_auth_session_set.success,
      db_working: results.step5_db_connection.success,
      user_has_credentials: results.step6_credentials_query.has_data,
      credentials_accessible: results.step6_credentials_query.success,
      likely_issue: null as string | null,
    };

    if (!analysis.auth_working) {
      analysis.likely_issue = 'Authentication token is invalid or expired';
    } else if (!analysis.auth_session_set) {
      analysis.likely_issue = 'Failed to set auth session on Supabase client';
    } else if (!analysis.db_working) {
      analysis.likely_issue = 'Database connection or permissions issue';
    } else if (!analysis.credentials_accessible) {
      analysis.likely_issue = 'RLS policies blocking access to bot_credentials table';
    } else if (!analysis.user_has_credentials) {
      analysis.likely_issue = 'User has no credentials record in database (but auth context should now work)';
    } else {
      analysis.likely_issue = 'All systems working - authentication context fixed!';
    }

    console.log('Final analysis:', analysis);

    return new Response(JSON.stringify({ 
      diagnostic_results: results,
      analysis: analysis,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message,
      diagnostic_incomplete: true,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
