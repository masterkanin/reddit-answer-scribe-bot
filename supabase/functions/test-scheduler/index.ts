
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 Testing scheduler function...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        error: 'Missing environment variables',
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !supabaseServiceKey
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Test health check first
    console.log('🏥 Testing health check...');
    const healthResponse = await fetch(`${supabaseUrl}/functions/v1/reddit-bot-scheduler/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    const healthResult = {
      status: healthResponse.status,
      ok: healthResponse.ok,
      data: healthResponse.ok ? await healthResponse.json() : await healthResponse.text()
    };

    console.log('🏥 Health check result:', healthResult);

    // Test main scheduler function
    console.log('🤖 Testing main scheduler...');
    const schedulerResponse = await fetch(`${supabaseUrl}/functions/v1/reddit-bot-scheduler`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: true }),
    });

    const schedulerResult = {
      status: schedulerResponse.status,
      ok: schedulerResponse.ok,
      data: schedulerResponse.ok ? await schedulerResponse.json() : await schedulerResponse.text()
    };

    console.log('🤖 Scheduler test result:', schedulerResult);

    return new Response(JSON.stringify({
      message: 'Test completed',
      healthCheck: healthResult,
      schedulerTest: schedulerResult,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Test error:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
