
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Clock, CheckCircle, XCircle, Pause, Play, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBotOperations } from "@/hooks/useBotOperations";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";
import GeminiTest from "@/components/GeminiTest";
import AuthDialog from "@/components/AuthDialog";

const Index = () => {
  const { user } = useAuth();
  const { 
    currentSession, 
    isRunning, 
    startBot, 
    stopBot, 
    statusDisplay,
    nextRunTime,
    subredditList,
    dailyCommentCount,
    dailyLimit
  } = useBotOperations();
  
  const [subreddits, setSubreddits] = useState<string[]>([]);

  // Sync subreddits with current session
  useEffect(() => {
    if (currentSession?.subreddit_list) {
      setSubreddits(currentSession.subreddit_list);
    }
  }, [currentSession]);

  const handleStartBot = async () => {
    if (subreddits.length === 0) {
      toast.error("Please add at least one subreddit to monitor");
      return;
    }
    
    const success = await startBot(subreddits);
    if (success) {
      console.log("Bot started successfully");
    }
  };

  const handleStopBot = async () => {
    await stopBot();
  };

  const getStatusColor = () => {
    if (!currentSession || !currentSession.is_active) return 'bg-gray-500';
    
    switch (currentSession.status) {
      case 'active':
        return 'bg-green-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    if (!currentSession || !currentSession.is_active) return <StopCircle className="h-4 w-4" />;
    
    switch (currentSession.status) {
      case 'active':
        return <Play className="h-4 w-4" />;
      case 'paused':
        return <Pause className="h-4 w-4" />;
      case 'error':
        return <XCircle className="h-4 w-4" />;
      default:
        return <StopCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Bot className="h-10 w-10 text-blue-400" />
            Reddit AI Bot Manager
          </h1>
          <p className="text-slate-300 text-lg">
            Persistent AI-powered Reddit bot that runs 24/7 in the cloud
          </p>
        </div>

        {!user && (
          <div className="text-center mb-8">
            <AuthDialog />
          </div>
        )}

        {user && (
          <>
            {/* Bot Status Card */}
            <Card className="bg-slate-800 border-slate-700 mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
                    <CardTitle className="text-white flex items-center gap-2">
                      {getStatusIcon()}
                      Bot Status: {statusDisplay}
                    </CardTitle>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-slate-300">
                      {dailyCommentCount}/{dailyLimit} today
                    </Badge>
                    {isRunning ? (
                      <Button 
                        onClick={handleStopBot}
                        variant="destructive"
                        size="sm"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        Stop Bot
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleStartBot}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Start Bot
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-slate-300">
                    <span className="font-medium">Subreddits:</span> {subredditList.length}
                  </div>
                  <div className="text-slate-300">
                    <span className="font-medium">Questions Processed:</span> {currentSession?.questions_processed || 0}
                  </div>
                  <div className="text-slate-300">
                    <span className="font-medium">Successful Answers:</span> {currentSession?.successful_answers || 0}
                  </div>
                  <div className="text-slate-300">
                    <span className="font-medium">Errors:</span> {currentSession?.error_count || 0}
                  </div>
                </div>
                
                {nextRunTime && (
                  <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                    <div className="flex items-center text-yellow-200">
                      <Clock className="h-4 w-4 mr-2" />
                      <span className="text-sm">
                        Next run scheduled for: {nextRunTime.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {currentSession?.last_activity && (
                  <div className="mt-2 text-xs text-slate-400">
                    Last activity: {new Date(currentSession.last_activity).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="subreddits" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5 bg-slate-800 border border-slate-700">
                <TabsTrigger value="subreddits" className="text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                  Subreddits
                </TabsTrigger>
                <TabsTrigger value="reddit" className="text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                  Reddit Setup
                </TabsTrigger>
                <TabsTrigger value="ai" className="text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                  AI Setup
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                  Activity
                </TabsTrigger>
                <TabsTrigger value="stats" className="text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
                  Stats
                </TabsTrigger>
              </TabsList>

              <TabsContent value="subreddits">
                <SubredditManager 
                  subreddits={subreddits}
                  setSubreddits={setSubreddits}
                  isAuthenticated={!!user}
                />
              </TabsContent>

              <TabsContent value="reddit">
                <RedditAuth />
              </TabsContent>

              <TabsContent value="ai">
                <GeminiTest />
              </TabsContent>

              <TabsContent value="activity">
                <BotActivity />
              </TabsContent>

              <TabsContent value="stats">
                <BotStats />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
