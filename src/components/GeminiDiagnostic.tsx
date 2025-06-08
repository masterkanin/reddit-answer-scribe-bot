
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bug, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface DiagnosticResult {
  diagnostic_results: any;
  analysis: any;
  timestamp: string;
}

const GeminiDiagnostic = () => {
  const { session, user } = useAuth();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const runDiagnostic = async () => {
    if (!session || !user) {
      toast.error('Please sign in to run diagnostic');
      return;
    }

    setTesting(true);
    setResult(null);
    
    try {
      console.log('🔍 Running Gemini diagnostic...');
      
      const { data, error } = await supabase.functions.invoke('gemini-diagnostic', {
        body: {},
      });

      if (error) {
        console.error('❌ Diagnostic error:', error);
        toast.error('Diagnostic failed');
        return;
      }

      console.log('✅ Diagnostic completed:', data);
      setResult(data);
      toast.success('Diagnostic completed!');
    } catch (error: any) {
      console.error('❌ Diagnostic exception:', error);
      toast.error('Diagnostic failed');
    } finally {
      setTesting(false);
    }
  };

  const getStepStatus = (step: any) => {
    if (step?.success === true || step?.present === true || step?.created === true) {
      return { color: 'text-green-400', icon: CheckCircle };
    }
    return { color: 'text-red-400', icon: XCircle };
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Bug className="h-6 w-6 text-orange-500" />
          <div>
            <CardTitle className="text-white">Gemini Diagnostic</CardTitle>
            <CardDescription className="text-slate-400">
              Detailed debugging to identify authentication issues
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!session || !user ? (
          <div className="text-center py-4 text-slate-400">
            Please sign in to run diagnostic
          </div>
        ) : (
          <>
            <Button 
              onClick={runDiagnostic}
              disabled={testing}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Diagnostic...
                </>
              ) : (
                <>
                  <Bug className="h-4 w-4 mr-2" />
                  Run Full Diagnostic
                </>
              )}
            </Button>
          </>
        )}

        {result && (
          <div className="space-y-4">
            {/* Analysis Summary */}
            <div className="p-4 rounded-lg border border-orange-600 bg-orange-900/20">
              <h3 className="text-orange-400 font-medium mb-2">Analysis Result</h3>
              <p className="text-orange-300 text-sm mb-2">
                <strong>Likely Issue:</strong> {result.analysis.likely_issue}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={result.analysis.auth_working ? 'text-green-400' : 'text-red-400'}>
                  Auth: {result.analysis.auth_working ? 'Working' : 'Failed'}
                </div>
                <div className={result.analysis.db_working ? 'text-green-400' : 'text-red-400'}>
                  DB: {result.analysis.db_working ? 'Working' : 'Failed'}
                </div>
                <div className={result.analysis.credentials_accessible ? 'text-green-400' : 'text-red-400'}>
                  Access: {result.analysis.credentials_accessible ? 'Working' : 'Failed'}
                </div>
                <div className={result.analysis.user_has_credentials ? 'text-green-400' : 'text-red-400'}>
                  Data: {result.analysis.user_has_credentials ? 'Found' : 'Missing'}
                </div>
              </div>
            </div>

            {/* Detailed Steps */}
            <div className="space-y-2">
              <h3 className="text-white font-medium">Diagnostic Steps</h3>
              
              {Object.entries(result.diagnostic_results).map(([step, data]: [string, any]) => {
                const status = getStepStatus(data);
                return (
                  <div key={step} className="p-3 bg-slate-700 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <status.icon className={`h-4 w-4 ${status.color}`} />
                      <span className="text-white text-sm font-medium">
                        {step.replace('step', 'Step ').replace('_', ' - ')}
                      </span>
                    </div>
                    <pre className="text-xs text-slate-300 overflow-x-auto">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GeminiDiagnostic;
