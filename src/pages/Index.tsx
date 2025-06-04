
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot, Activity, Settings, Plus, Trash2, MessageCircle, Zap, LogIn, LogOut, User } from "lucide-react";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/hooks/useAuth";
import { useBotCredentials } from "@/hooks/useBotCredentials";

const Index = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { isRedditConnected, isGeminiConnected } = useBotCredentials();
  const [botActive, setBotActive] = useState(false);
  const [subreddits, setSubreddits] = useState(['AskReddit', 'explainlikeimfive', 'NoStupidQuestions']);

  const toggleBot = () => {
    if (!user) {
      toast.error("Please sign in to control the bot");
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

    setBotActive(!botActive);
    toast.success(botActive ? "Bot stopped" : "Bot started monitoring subreddits");
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
              <p className="text-blue-200">AI-powered automatic question answering</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-2 text-white">
                  <User className="h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </div>
                <Badge variant={botActive ? "default" : "secondary"} className="px-3 py-1">
                  {botActive ? "🟢 Active" : "🔴 Inactive"}
                </Badge>
                <Button 
                  onClick={toggleBot} 
                  disabled={!isRedditConnected() || !isGeminiConnected()}
                  className={`${botActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {botActive ? 'Stop Bot' : 'Start Bot'}
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
            <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
              An AI-powered bot that monitors subreddits and automatically answers questions using Google Gemini. 
              Sign in to set up your credentials and start monitoring subreddits.
            </p>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <BotActivity isActive={botActive} />
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
                    <CardTitle className="text-white">Gemini AI Configuration</CardTitle>
                    <CardDescription className="text-slate-400">
                      Configure your Google Gemini API for generating answers
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input 
                      placeholder="Enter your Gemini API key" 
                      type="password"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">
                      Save API Key
                    </Button>
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
