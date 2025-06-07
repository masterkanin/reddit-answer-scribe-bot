
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
import { Bot, Activity, Settings, Plus, Trash2, MessageCircle, Zap, LogIn, LogOut, User, CheckCircle, XCircle, Shield, AlertTriangle } from "lucide-react";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/hooks/useAuth";
import { useBotCredentials } from "@/hooks/useBotCredentials";
import { useBotOperations } from "@/hooks/useBotOperations";

const Index = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { credentials, updateCredentials, isRedditConnected, isGeminiConnected, loading: credentialsLoading } = useBotCredentials();
  const { isRunning, startBot, stopBot, dailyCommentCount, dailyLimit, isInCooldown, errorCount } = useBotOperations();
  const [subreddits, setSubreddits] = useState(['AskReddit', 'explainlikeimfive', 'NoStupidQuestions']);
  const [geminiApiKey, setGeminiApiKey] = useState('');

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
    }
  };

  const toggleBot = async () => {
    if (!user) {
      toast.error("Please sign in to control the bot");
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
              <p className="text-blue-200">AI-powered automatic question answering (Conservative Mode)</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-2 text-white">
                  <User className="h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </div>
                
                {/* Account Health Status */}
                <div className="flex items-center space-x-2">
                  {isInCooldown ? (
                    <Badge variant="destructive" className="px-3 py-1">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Cooldown
                    </Badge>
                  ) : errorCount > 0 ? (
                    <Badge variant="secondary" className="px-3 py-1">
                      <Shield className="h-3 w-3 mr-1" />
                      {errorCount} Errors
                    </Badge>
                  ) : (
                    <Badge className="bg-green-600 px-3 py-1">
                      <Shield className="h-3 w-3 mr-1" />
                      Healthy
                    </Badge>
                  )}
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
                
                <Button 
                  onClick={toggleBot} 
                  disabled={!isRedditConnected() || !isGeminiConnected() || subreddits.length === 0 || isInCooldown}
                  className={`${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isRunning ? 'Stop Bot' : isInCooldown ? 'In Cooldown' : 'Start Bot'}
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
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 mb-8 max-w-2xl mx-auto">
              <div className="flex items-center space-x-2 text-yellow-400 mb-2">
                <Shield className="h-5 w-5" />
                <span className="font-medium">Anti-Suspension Protection</span>
              </div>
              <p className="text-yellow-200 text-sm">
                This bot operates in conservative mode with built-in rate limiting, daily comment limits, 
                error detection, and human-like behavior patterns to prevent Reddit account suspension.
              </p>
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
              {/* Safety Status Card */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-green-500" />
                    <span>Account Protection Status</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{dailyCommentCount}/{dailyLimit}</div>
                      <div className="text-sm text-slate-400">Daily Comments</div>
                      <Progress value={(dailyCommentCount / dailyLimit) * 100} className="mt-2" />
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{errorCount}</div>
                      <div className="text-sm text-slate-400">Recent Errors</div>
                      <div className={`text-sm mt-2 ${errorCount < 3 ? 'text-green-400' : 'text-red-400'}`}>
                        {errorCount < 3 ? 'Healthy' : 'At Risk'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">15min</div>
                      <div className="text-sm text-slate-400">Check Interval</div>
                      <div className="text-sm text-green-400 mt-2">Conservative</div>
                    </div>
                  </div>
                  {isInCooldown && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-600 rounded-lg">
                      <p className="text-red-400 text-sm">
                        🛑 Bot is in 30-minute cooldown mode due to recent errors. This protects your account from suspension.
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
                    ) : !isGeminiConnected() || !user ? (
                      <>
                        {!user && (
                          <div className="text-center py-4 text-slate-400">
                            Please sign in to save your Gemini API key
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="gemini-key" className="text-slate-300">Gemini API Key</Label>
                          <Input 
                            id="gemini-key"
                            placeholder="Enter your Gemini API key" 
                            type="password"
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white"
                            disabled={!user}
                          />
                        </div>
                        <Button 
                          onClick={handleSaveGeminiKey}
                          className="w-full bg-green-600 hover:bg-green-700"
                          disabled={!user || !geminiApiKey.trim()}
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          {user ? 'Save API Key' : 'Sign In to Connect Gemini'}
                        </Button>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-green-400 font-medium">Successfully connected to Gemini AI</p>
                        <p className="text-slate-400 text-sm">Bot can now generate intelligent answers</p>
                        <Button 
                          onClick={() => setGeminiApiKey('')}
                          variant="outline"
                          className="mt-4 text-slate-300 border-slate-600 hover:bg-slate-700"
                        >
                          Update API Key
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Index;
