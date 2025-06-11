import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot, Activity, Settings, Plus, Trash2, MessageCircle, Zap, LogIn, LogOut, User, CheckCircle, XCircle, Shield, AlertTriangle, Clock, Eye, Edit } from "lucide-react";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/hooks/useAuth";
import { useBotCredentials } from "@/hooks/useBotCredentials";
import { useBotOperations } from "@/hooks/useBotOperations";
import GeminiTest from "@/components/GeminiTest";
import GeminiDiagnostic from "@/components/GeminiDiagnostic";

const Index = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { credentials, updateCredentials, isRedditConnected, isGeminiConnected, loading: credentialsLoading } = useBotCredentials();
  const { 
    isRunning, 
    startBot, 
    stopBot, 
    dailyCommentCount, 
    dailyLimit, 
    isInCooldown, 
    errorCount, 
    isShadowbanned,
    apiCallCount,
    apiRateLimit 
  } = useBotOperations();
  const [subreddits, setSubreddits] = useState(['AskReddit', 'explainlikeimfive', 'NoStupidQuestions']);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isEditingGeminiKey, setIsEditingGeminiKey] = useState(false);

  // Sync Gemini API key with credentials
  useEffect(() => {
    if (credentials?.gemini_api_key) {
      setGeminiApiKey(credentials.gemini_api_key);
    }
  }, [credentials]);

  const handleSaveGeminiKey = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    if (!geminiApiKey.trim()) {
      toast.error("Please enter a valid Gemini API key");
      return;
    }

    const success = await updateCredentials({
      gemini_api_key: geminiApiKey.trim()
    });

    if (success) {
      toast.success("Gemini API key saved successfully!");
      setIsEditingGeminiKey(false);
    }
  };

  const handleUpdateGeminiKey = () => {
    setIsEditingGeminiKey(true);
    setGeminiApiKey(''); // Clear for new input
  };

  const handleCancelEdit = () => {
    setIsEditingGeminiKey(false);
    // Restore original key
    if (credentials?.gemini_api_key) {
      setGeminiApiKey(credentials.gemini_api_key);
    }
  };

  const getMaskedKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '***';
    return key.substring(0, 4) + '***' + key.substring(key.length - 4);
  };

  const toggleBot = async () => {
    if (!user) {
      toast.error("Please sign in to control the bot");
      return;
    }
    
    if (isShadowbanned) {
      toast.error("Account appears to be shadowbanned. Please wait 24 hours before retrying.");
      return;
    }
    
    if (isInCooldown) {
      toast.error("Bot is in cooldown mode due to recent errors. Please wait before restarting.");
      return;
    }
    
    if (!isRedditConnected()) {
      toast.error("Please connect your Reddit credentials first");
      return;
    }
    
    if (!isGeminiConnected()) {
      toast.error("Please set your Gemini API key first");
      return;
    }

    if (subreddits.length === 0) {
      toast.error("Please add at least one subreddit to monitor");
      return;
    }

    if (isRunning) {
      await stopBot();
    } else {
      await startBot(subreddits);
    }
  };

  // Get account health status
  const getAccountHealth = () => {
    if (isShadowbanned) return { status: 'shadowbanned', color: 'destructive', icon: Eye };
    if (isInCooldown) return { status: 'cooldown', color: 'secondary', icon: Clock };
    if (errorCount > 1) return { status: 'at-risk', color: 'secondary', icon: AlertTriangle };
    return { status: 'healthy', color: 'default', icon: Shield };
  };

  const accountHealth = getAccountHealth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-500 rounded-xl">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Reddit Q&A Bot</h1>
              <p className="text-blue-200">AI-powered automatic question answering (Reddit Compliant)</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-2 text-white">
                  <User className="h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </div>
                
                {/* Enhanced Account Health Status */}
                <div className="flex items-center space-x-2">
                  <Badge variant={accountHealth.color as any} className="px-3 py-1">
                    <accountHealth.icon className="h-3 w-3 mr-1" />
                    {accountHealth.status === 'shadowbanned' && 'Shadowbanned'}
                    {accountHealth.status === 'cooldown' && 'Cooldown'}
                    {accountHealth.status === 'at-risk' && 'At Risk'}
                    {accountHealth.status === 'healthy' && 'Healthy'}
                  </Badge>
                </div>

                <Badge variant={isRunning ? "default" : "secondary"} className="px-3 py-1">
                  {isRunning ? "🟢 Active" : "🔴 Inactive"}
                </Badge>
                
                {/* Daily Progress */}
                <div className="flex items-center space-x-2 text-white">
                  <span className="text-sm">Daily: {dailyCommentCount}/{dailyLimit}</span>
                  <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${Math.min((dailyCommentCount / dailyLimit) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* API Rate Limit */}
                <div className="flex items-center space-x-2 text-white">
                  <span className="text-sm">API: {apiCallCount}/{apiRateLimit}</span>
                  <div className="w-12 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${Math.min((apiCallCount / apiRateLimit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                
                <Button 
                  onClick={toggleBot} 
                  disabled={!isRedditConnected() || !isGeminiConnected() || subreddits.length === 0 || isInCooldown || isShadowbanned}
                  className={`${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isRunning ? 'Stop Bot' : 
                   isShadowbanned ? 'Shadowbanned' :
                   isInCooldown ? 'In Cooldown' : 'Start Bot'}
                </Button>
                <Button 
                  onClick={signOut}
                  variant="outline"
                  className="text-white border-slate-600 hover:bg-slate-700"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <AuthDialog>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Button>
              </AuthDialog>
            )}
          </div>
        </div>

        {!user ? (
          <div className="text-center py-16">
            <Bot className="h-24 w-24 text-blue-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to Reddit Q&A Bot</h2>
            <p className="text-slate-400 mb-4 max-w-2xl mx-auto">
              An AI-powered bot that monitors subreddits and automatically answers questions using Google Gemini. 
            </p>
            <div className="bg-green-900/30 border border-green-600 rounded-lg p-4 mb-8 max-w-2xl mx-auto">
              <div className="flex items-center space-x-2 text-green-400 mb-2">
                <Shield className="h-5 w-5" />
                <span className="font-medium">Reddit Compliance Guaranteed</span>
              </div>
              <div className="text-green-200 text-sm space-y-1">
                <p>✅ Follows all Reddit anti-spam policies</p>
                <p>✅ Proper bot identification & disclaimers</p>
                <p>✅ Conservative rate limiting (2-4 min between posts)</p>
                <p>✅ Only answers truly unanswered questions (0-2 comments)</p>
                <p>✅ Automatic shadowban detection & prevention</p>
                <p>✅ API rate limiting (under 60 req/min)</p>
              </div>
            </div>
            <AuthDialog>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                <LogIn className="h-5 w-5 mr-2" />
                Get Started
              </Button>
            </AuthDialog>
          </div>
        ) : (
          /* Main Dashboard */
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="bg-slate-800 border-slate-700">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-blue-600">
                <Activity className="h-4 w-4 mr-2" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="subreddits" className="data-[state=active]:bg-blue-600">
                <MessageCircle className="h-4 w-4 mr-2" />
                Subreddits
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-blue-600">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              {/* Enhanced Compliance Status Card */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-green-500" />
                    <span>Reddit Compliance Status</span>
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Real-time monitoring of account health and Reddit policy compliance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{dailyCommentCount}/{dailyLimit}</div>
                      <div className="text-sm text-slate-400">Daily Comments</div>
                      <Progress value={(dailyCommentCount / dailyLimit) * 100} className="mt-2" />
                      <div className="text-xs text-slate-500 mt-1">Conservative limit</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{apiCallCount}/{apiRateLimit}</div>
                      <div className="text-sm text-slate-400">API Calls/Min</div>
                      <Progress value={(apiCallCount / apiRateLimit) * 100} className="mt-2" />
                      <div className="text-xs text-slate-500 mt-1">Under Reddit limit</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{errorCount}</div>
                      <div className="text-sm text-slate-400">Recent Errors</div>
                      <div className={`text-sm mt-2 ${errorCount < 2 ? 'text-green-400' : 'text-red-400'}`}>
                        {errorCount < 2 ? 'Healthy' : 'At Risk'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Auto-cooldown at 2</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">2-4min</div>
                      <div className="text-sm text-slate-400">Post Interval</div>
                      <div className="text-sm text-green-400 mt-2">Compliant</div>
                      <div className="text-xs text-slate-500 mt-1">Random jitter</div>
                    </div>
                  </div>
                  
                  {/* Status Alerts */}
                  {isShadowbanned && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-600 rounded-lg">
                      <div className="flex items-center space-x-2 text-red-400 mb-1">
                        <Eye className="h-4 w-4" />
                        <span className="font-medium">Account Shadowbanned</span>
                      </div>
                      <p className="text-red-300 text-sm">
                        Multiple consecutive 401 errors detected. Account may be shadowbanned. Please wait 24 hours before retrying.
                      </p>
                    </div>
                  )}
                  
                  {isInCooldown && !isShadowbanned && (
                    <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                      <div className="flex items-center space-x-2 text-yellow-400 mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium">Cooldown Mode Active</span>
                      </div>
                      <p className="text-yellow-300 text-sm">
                        Bot is in 60-minute cooldown due to recent errors. This protects your account from suspension.
                      </p>
                    </div>
                  )}
                  
                  {errorCount === 0 && !isInCooldown && !isShadowbanned && (
                    <div className="mt-4 p-3 bg-green-900/30 border border-green-600 rounded-lg">
                      <div className="flex items-center space-x-2 text-green-400 mb-1">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">All Systems Healthy</span>
                      </div>
                      <p className="text-green-300 text-sm">
                        Bot is operating normally with full Reddit compliance. No recent errors detected.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <BotActivity isActive={isRunning} />
                </div>
                <div>
                  <BotStats />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="subreddits">
              <SubredditManager 
                subreddits={subreddits} 
                setSubreddits={setSubreddits}
                isAuthenticated={isRedditConnected()}
              />
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RedditAuth />
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Zap className="h-6 w-6 text-green-500" />
                        <div>
                          <CardTitle className="text-white">Gemini AI Configuration</CardTitle>
                          <CardDescription className="text-slate-400">
                            Configure your Google Gemini API for generating answers
                          </CardDescription>
                        </div>
                      </div>
                      {isGeminiConnected() ? (
                        <Badge className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Disconnected
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {credentialsLoading ? (
                      <div className="text-center text-slate-400">Loading...</div>
                    ) : !isGeminiConnected() || !user || isEditingGeminiKey ? (
                      <>
                        {!user && !isEditingGeminiKey && (
                          <div className="text-center py-4 text-slate-400">
                            Please sign in to save your Gemini API key
                          </div>
                        )}
                        
                        {(user && (!isGeminiConnected() || isEditingGeminiKey)) && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="gemini-key" className="text-slate-300">
                                {isEditingGeminiKey ? 'New Gemini API Key' : 'Gemini API Key'}
                              </Label>
                              <Input 
                                id="gemini-key"
                                placeholder="Enter your Gemini API key" 
                                type="password"
                                value={geminiApiKey}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                className="bg-slate-700 border-slate-600 text-white"
                              />
                              {isEditingGeminiKey && (
                                <p className="text-xs text-slate-400">
                                  Current key: {getMaskedKey(credentials?.gemini_api_key || '')}
                                </p>
                              )}
                            </div>
                            <div className="flex space-x-2">
                              <Button 
                                onClick={handleSaveGeminiKey}
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                disabled={!geminiApiKey.trim()}
                              >
                                <Zap className="h-4 w-4 mr-2" />
                                {isEditingGeminiKey ? 'Update API Key' : 'Save API Key'}
                              </Button>
                              {isEditingGeminiKey && (
                                <Button 
                                  onClick={handleCancelEdit}
                                  variant="outline"
                                  className="text-slate-300 border-slate-600 hover:bg-slate-700"
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                        
                        {!user && (
                          <Button 
                            disabled
                            className="w-full bg-gray-600"
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Sign In to Connect Gemini
                          </Button>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-green-400 font-medium">Successfully connected to Gemini AI</p>
                        <p className="text-slate-400 text-sm mb-3">
                          Key: {getMaskedKey(credentials?.gemini_api_key || '')}
                        </p>
                        <p className="text-slate-400 text-sm mb-4">Bot can now generate intelligent answers</p>
                        <Button 
                          onClick={handleUpdateGeminiKey}
                          variant="outline"
                          className="text-slate-300 border-slate-600 hover:bg-slate-700"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Update API Key
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              {/* Add testing components */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <GeminiTest />
                <GeminiDiagnostic />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Index;
