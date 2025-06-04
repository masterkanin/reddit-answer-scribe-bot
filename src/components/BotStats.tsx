
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, MessageSquare, CheckCircle, Clock, Zap } from "lucide-react";

const BotStats: React.FC = () => {
  // Mock statistics data
  const stats = {
    questionsAnswered: 1247,
    questionsToday: 23,
    successRate: 94,
    avgResponseTime: '2.3s',
    upvotes: 892,
    totalSubreddits: 3
  };

  const todayProgress = (stats.questionsToday / 50) * 100; // Assuming daily goal of 50

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Bot Performance</CardTitle>
          <CardDescription className="text-slate-400">
            Real-time statistics and metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Total Questions Answered */}
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400 mb-1">
              {stats.questionsAnswered.toLocaleString()}
            </div>
            <p className="text-sm text-slate-400">Total Questions Answered</p>
          </div>

          {/* Today's Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">Today's Activity</span>
              <Badge variant="outline" className="text-green-400 border-green-400">
                {stats.questionsToday} questions
              </Badge>
            </div>
            <Progress value={todayProgress} className="h-2" />
            <p className="text-xs text-slate-400 mt-1">
              {Math.round(todayProgress)}% of daily goal
            </p>
          </div>

          {/* Success Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">Success Rate</span>
              <span className="text-sm font-medium text-green-400">{stats.successRate}%</span>
            </div>
            <Progress value={stats.successRate} className="h-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-sm text-slate-300">Avg Response Time</span>
            </div>
            <span className="text-sm font-medium text-white">{stats.avgResponseTime}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-sm text-slate-300">Total Upvotes</span>
            </div>
            <span className="text-sm font-medium text-white">{stats.upvotes}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-blue-400" />
              <span className="text-sm text-slate-300">Active Subreddits</span>
            </div>
            <span className="text-sm font-medium text-white">{stats.totalSubreddits}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-slate-300">Bot Status</span>
            </div>
            <Badge className="bg-green-600 text-white">Online</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-blue-600 to-purple-600 border-0">
        <CardContent className="p-4 text-center">
          <Clock className="h-8 w-8 text-white mx-auto mb-2" />
          <p className="text-white font-medium">Bot Uptime</p>
          <p className="text-blue-100 text-sm">4h 23m running</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BotStats;
