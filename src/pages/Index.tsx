
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Square, Settings, Activity, Users, TrendingUp, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBotOperations } from "@/hooks/useBotOperations";
import { useBotCredentials } from "@/hooks/useBotCredentials";
import AuthDialog from "@/components/AuthDialog";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";
import ManualSchedulerTest from "@/components/ManualSchedulerTest";
import GeminiDiagnostic from "@/components/GeminiDiagnostic";
import { toast } from "sonner";

const Index = () => {
  const { user } = useAuth();
  const { isRedditConnected, isGeminiConnected } = useBotCredentials();
  const [subreddits, setSubreddits] = useState<string[]>(['AskReddit', 'explainlikeimfive', 'NoStupidQuestions']);
  
  const {
    currentSession,
    isRunning,
    recentActivities,
    startBot,
    stopBot,
    dailyCommentCount,
    dailyLimit,
    isInCooldown,
    errorCount,
    isShadowbanned,
    apiCallCount,
    apiRateLimit,
  } = useBotOperations();

  const handleStartBot = async () => {
    if (!isRedditConnected || !isGeminiConnected) {
      toast.error("Please connect both Reddit and Gemini first");
      return;
    }
    
    const success = await startBot(subreddits);
    if (success) {
      toast.success("Bot started successfully!");
    }
  };

  const handleStopBot = async () => {
    await stopBot();
    toast.success("Bot stopped");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Reddit AI Assistant Bot
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Automatically monitors Reddit for questions and provides helpful AI-generated answers
          </p>
        </div>

        {!user ? (
          <div className="max-w-md mx-auto">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="text-center">
                <CardTitle className="text-white">Get Started</CardTitle>
                <CardDescription className="text-slate-400">
                  Sign in to start using the Reddit AI Assistant Bot
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <AuthDialog>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Sign In / Sign Up
                  </Button>
                </AuthDialog>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white">Bot Status</CardTitle>
                  <Activity className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {isRunning ? (
                      <Badge className="bg-green-600">Running</Badge>
                    ) : (
                      <Badge variant="secondary">Stopped</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isRunning ? "Monitoring subreddits" : "Ready to start"}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white">Daily Progress</CardTitle>
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {dailyCommentCount}/{dailyLimit}
                  </div>
                  <p className="text-xs text-slate-400">
                    Comments posted today
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-white">Recent Activity</CardTitle>
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {recentActivities.length}
                  </div>
                  <p className="text-xs text-slate-400">
                    Total interactions
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="control" className="w-full">
              <TabsList className="grid w-full grid-cols-5 bg-slate-800">
                <TabsTrigger value="control">Control</TabsTrigger>
                <TabsTrigger value="subreddits">Subreddits</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
                <TabsTrigger value="debug">Debug</TabsTrigger>
              </TabsList>

              <TabsContent value="control" className="space-y-6">
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Bot Control Panel</CardTitle>
                    <CardDescription className="text-slate-400">
                      Start or stop the Reddit AI assistant bot
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-lg font-medium text-white">
                          {isRunning ? "Bot is Active" : "Bot is Stopped"}
                        </h3>
                        <p className="text-sm text-slate-400">
                          {isRunning 
                            ? "Automatically checking for questions every 4 minutes"
                            : "Click start to begin monitoring subreddits"
                          }
                        </p>
                      </div>
                      
                      {isRunning ? (
                        <Button 
                          onClick={handleStopBot}
                          variant="destructive"
                          size="lg"
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Stop Bot
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleStartBot}
                          disabled={!isRedditConnected || !isGeminiConnected || isInCooldown}
                          size="lg"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Bot
                        </Button>
                      )}
                    </div>

                    {isInCooldown && (
                      <div className="p-4 bg-yellow-900/20 border border-yellow-600 rounded-lg">
                        <p className="text-yellow-400 text-sm">
                          ⚠️ Bot is in cooldown mode due to recent errors. Please wait before restarting.
                        </p>
                      </div>
                    )}

                    {isShadowbanned && (
                      <div className="p-4 bg-red-900/20 border border-red-600 rounded-lg">
                        <p className="text-red-400 text-sm">
                          🚫 Potential shadowban detected. Consider checking your Reddit account status.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                      <div className="text-center">
                        <p className="text-sm text-slate-400">Error Count</p>
                        <p className="text-lg font-semibold text-white">{errorCount}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-slate-400">API Calls</p>
                        <p className="text-lg font-semibold text-white">{apiCallCount}/{apiRateLimit}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <RedditAuth />
                <GeminiDiagnostic />
              </TabsContent>

              <TabsContent value="subreddits">
                <SubredditManager 
                  subreddits={subreddits}
                  setSubreddits={setSubreddits}
                  isAuthenticated={isRedditConnected}
                />
              </TabsContent>

              <TabsContent value="activity">
                <BotActivity isActive={isRunning} />
              </TabsContent>

              <TabsContent value="stats">
                <BotStats />
              </TabsContent>

              <TabsContent value="debug">
                <div className="space-y-6">
                  <ManualSchedulerTest />
                  
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white">Debug Information</CardTitle>
                      <CardDescription className="text-slate-400">
                        Current bot status and session details
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Session ID:</span>
                          <span className="text-white">{currentSession?.id || 'None'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Questions Processed:</span>
                          <span className="text-white">{currentSession?.questions_processed || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Successful Answers:</span>
                          <span className="text-white">{currentSession?.successful_answers || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Error Count:</span>
                          <span className="text-white">{currentSession?.error_count || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Reddit Connected:</span>
                          <span className="text-white">{isRedditConnected ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Gemini Connected:</span>
                          <span className="text-white">{isGeminiConnected ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
