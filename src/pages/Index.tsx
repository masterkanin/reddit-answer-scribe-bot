import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot, Activity, Settings, Plus, Trash2, MessageCircle, Zap } from "lucide-react";
import RedditAuth from "@/components/RedditAuth";
import SubredditManager from "@/components/SubredditManager";
import BotActivity from "@/components/BotActivity";
import BotStats from "@/components/BotStats";

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [botActive, setBotActive] = useState(false);
  const [subreddits, setSubreddits] = useState(['AskReddit', 'explainlikeimfive', 'NoStupidQuestions']);

  const handleRedditAuth = () => {
    setIsAuthenticated(true);
    toast.success("Connected to Reddit successfully!");
  };

  const toggleBot = () => {
    setBotActive(!botActive);
    toast.success(botActive ? "Bot stopped" : "Bot started monitoring subreddits");
  };

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
            <Badge variant={botActive ? "default" : "secondary"} className="px-3 py-1">
              {botActive ? "🟢 Active" : "🔴 Inactive"}
            </Badge>
            <Button 
              onClick={toggleBot} 
              disabled={!isAuthenticated}
              className={`${botActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              <Zap className="h-4 w-4 mr-2" />
              {botActive ? 'Stop Bot' : 'Start Bot'}
            </Button>
          </div>
        </div>

        {/* Main Dashboard */}
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
              isAuthenticated={isAuthenticated}
            />
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RedditAuth 
                isAuthenticated={isAuthenticated} 
                onAuthenticate={handleRedditAuth} 
              />
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
      </div>
    </div>
  );
};

export default Index;
