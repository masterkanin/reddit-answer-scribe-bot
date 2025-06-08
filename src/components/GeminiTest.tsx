
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Zap, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

const GeminiTest = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const testGeminiAPI = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      console.log('🧪 Testing Gemini API integration...');
      
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

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="h-6 w-6 text-green-500" />
            <div>
              <CardTitle className="text-white">Test Gemini API</CardTitle>
              <CardDescription className="text-slate-400">
                Test your Gemini API key integration
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
