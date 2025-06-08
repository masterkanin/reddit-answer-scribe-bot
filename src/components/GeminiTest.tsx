
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Zap, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

const GeminiTest = () => {
  const { session, user } = useAuth();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const testGeminiAPI = async () => {
    if (!session || !user) {
      toast.error('Please sign in to test the Gemini API');
      return;
    }

    setTesting(true);
    setResult(null);
    
    try {
      console.log('🧪 Testing Gemini API integration...');
      console.log('User ID:', user.id);
      console.log('Session access token length:', session.access_token?.length || 0);
      
      // Refresh the session to ensure we have the latest token
      const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('❌ Session refresh error:', refreshError);
        toast.error('Session refresh failed. Please sign in again.');
        return;
      }

      const tokenToUse = refreshedSession.session?.access_token || session.access_token;
      console.log('Using token length:', tokenToUse?.length || 0);
      
      const { data, error } = await supabase.functions.invoke('gemini-ai', {
        body: {
          question: 'What is 2+2?',
          title: 'Simple Math Test',
          subreddit: 'test',
        },
      });

      if (error) {
        console.error('❌ Gemini test error:', error);
        setResult({
          success: false,
          message: `Gemini API test failed: ${error.message}`,
          details: error
        });
        toast.error('Gemini API test failed');
        return;
      }

      if (data?.answer) {
        console.log('✅ Gemini test successful:', data.answer);
        setResult({
          success: true,
          message: 'Gemini API is working correctly!',
          details: { answer: data.answer }
        });
        toast.success('Gemini API test successful!');
      } else {
        setResult({
          success: false,
          message: 'Gemini API returned no answer',
          details: data
        });
        toast.error('Gemini API test failed - no answer returned');
      }
    } catch (error: any) {
      console.error('❌ Gemini test exception:', error);
      setResult({
        success: false,
        message: `Test failed: ${error.message}`,
        details: error
      });
      toast.error('Gemini API test failed');
    } finally {
      setTesting(false);
    }
  };

  const refreshSession = async () => {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        toast.error('Failed to refresh session');
      } else {
        toast.success('Session refreshed successfully');
      }
    } catch (error) {
      toast.error('Failed to refresh session');
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="h-6 w-6 text-green-500" />
            <div>
              <CardTitle className="text-white">Test Gemini API</CardTitle>
              <CardDescription className="text-slate-400">
                Test your Gemini API key integration with enhanced debugging
              </CardDescription>
            </div>
          </div>
          {session && (
            <Button
              onClick={refreshSession}
              variant="outline"
              size="sm"
              className="text-slate-300 border-slate-600 hover:bg-slate-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Session
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!session || !user ? (
          <div className="text-center py-4 text-slate-400">
            Please sign in to test the Gemini API
          </div>
        ) : (
          <>
            <div className="text-xs text-slate-500 space-y-1">
              <p>User ID: {user.id}</p>
              <p>Session valid: {session ? 'Yes' : 'No'}</p>
              <p>Token length: {session.access_token?.length || 0}</p>
            </div>
            
            <Button 
              onClick={testGeminiAPI}
              disabled={testing}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Test Gemini API
                </>
              )}
            </Button>
          </>
        )}

        {result && (
          <div className={`p-4 rounded-lg border ${
            result.success 
              ? 'bg-green-900/30 border-green-600' 
              : 'bg-red-900/30 border-red-600'
          }`}>
            <div className="flex items-center space-x-2 mb-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? "Success" : "Failed"}
              </Badge>
            </div>
            
            <p className={`text-sm mb-2 ${
              result.success ? 'text-green-300' : 'text-red-300'
            }`}>
              {result.message}
            </p>
            
            {result.details && (
              <div className="mt-2">
                <p className="text-xs text-slate-400 mb-1">Details:</p>
                <pre className="text-xs bg-slate-900 p-2 rounded overflow-x-auto">
                  {typeof result.details === 'string' 
                    ? result.details 
                    : JSON.stringify(result.details, null, 2)
                  }
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GeminiTest;
