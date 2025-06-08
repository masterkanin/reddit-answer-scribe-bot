
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Activity, RefreshCw } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ManualSchedulerTest: React.FC = () => {
  const [isTestingHealth, setIsTestingHealth] = useState(false);
  const [isTestingScheduler, setIsTestingScheduler] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  const testHealthCheck = async () => {
    setIsTestingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke('reddit-bot-scheduler/health');
      
      if (error) {
        console.error('Health check error:', error);
        toast.error('Health check failed: ' + error.message);
        setTestResults({ type: 'health', success: false, error: error.message });
      } else {
        console.log('Health check success:', data);
        toast.success('Health check passed!');
        setTestResults({ type: 'health', success: true, data });
      }
    } catch (error) {
      console.error('Health check exception:', error);
      toast.error('Health check exception: ' + (error as Error).message);
      setTestResults({ type: 'health', success: false, error: (error as Error).message });
    } finally {
      setIsTestingHealth(false);
    }
  };

  const testScheduler = async () => {
    setIsTestingScheduler(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-scheduler');
      
      if (error) {
        console.error('Scheduler test error:', error);
        toast.error('Scheduler test failed: ' + error.message);
        setTestResults({ type: 'scheduler', success: false, error: error.message });
      } else {
        console.log('Scheduler test success:', data);
        toast.success('Scheduler test completed!');
        setTestResults({ type: 'scheduler', success: true, data });
      }
    } catch (error) {
      console.error('Scheduler test exception:', error);
      toast.error('Scheduler test exception: ' + (error as Error).message);
      setTestResults({ type: 'scheduler', success: false, error: (error as Error).message });
    } finally {
      setIsTestingScheduler(false);
    }
  };

  const runManualScheduler = async () => {
    setIsTestingScheduler(true);
    try {
      const { data, error } = await supabase.functions.invoke('reddit-bot-scheduler');
      
      if (error) {
        console.error('Manual scheduler error:', error);
        toast.error('Manual scheduler failed: ' + error.message);
        setTestResults({ type: 'manual', success: false, error: error.message });
      } else {
        console.log('Manual scheduler success:', data);
        toast.success('Manual scheduler completed!');
        setTestResults({ type: 'manual', success: true, data });
      }
    } catch (error) {
      console.error('Manual scheduler exception:', error);
      toast.error('Manual scheduler exception: ' + (error as Error).message);
      setTestResults({ type: 'manual', success: false, error: (error as Error).message });
    } finally {
      setIsTestingScheduler(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center space-x-2">
          <Activity className="h-5 w-5" />
          <span>Scheduler Testing</span>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Test the bot scheduler functionality manually
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={testHealthCheck}
            disabled={isTestingHealth}
            variant="outline"
            className="border-green-600 text-green-400 hover:bg-green-600/10"
          >
            {isTestingHealth ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
            Health Check
          </Button>
          
          <Button
            onClick={testScheduler}
            disabled={isTestingScheduler}
            variant="outline"
            className="border-blue-600 text-blue-400 hover:bg-blue-600/10"
          >
            {isTestingScheduler ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Test All Functions
          </Button>
          
          <Button
            onClick={runManualScheduler}
            disabled={isTestingScheduler}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isTestingScheduler ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Run Scheduler Now
          </Button>
        </div>

        {testResults && (
          <div className="mt-4">
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant={testResults.success ? "default" : "destructive"}>
                {testResults.type} test
              </Badge>
              <Badge variant={testResults.success ? "default" : "destructive"}>
                {testResults.success ? "Success" : "Failed"}
              </Badge>
            </div>
            
            <ScrollArea className="h-64 w-full border border-slate-600 rounded p-3 bg-slate-900">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ManualSchedulerTest;
