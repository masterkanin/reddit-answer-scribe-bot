
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, ExternalLink, Clock, User, ArrowUp } from "lucide-react";

interface ActivityItem {
  id: string;
  type: 'question_found' | 'answer_posted' | 'error';
  subreddit: string;
  title: string;
  author: string;
  timestamp: Date;
  url?: string;
  score?: number;
}

interface BotActivityProps {
  isActive: boolean;
}

const BotActivity: React.FC<BotActivityProps> = ({ isActive }) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Simulate real-time activity when bot is active
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const newActivity: ActivityItem = {
        id: Date.now().toString(),
        type: Math.random() > 0.3 ? 'answer_posted' : 'question_found',
        subreddit: ['AskReddit', 'explainlikeimfive', 'NoStupidQuestions'][Math.floor(Math.random() * 3)],
        title: [
          "How does quantum computing actually work?",
          "Why do cats purr when they're happy?",
          "What's the difference between HTTP and HTTPS?",
          "How do solar panels convert sunlight to electricity?",
          "Why do we dream during sleep?",
          "What causes northern lights to appear?",
          "How do vaccines protect against diseases?"
        ][Math.floor(Math.random() * 7)],
        author: `user${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date(),
        url: `https://reddit.com/r/example/comments/${Math.random().toString(36).substring(7)}`,
        score: Math.floor(Math.random() * 50) + 1
      };

      setActivities(prev => [newActivity, ...prev.slice(0, 19)]);
    }, Math.random() * 10000 + 5000); // Random interval between 5-15 seconds

    return () => clearInterval(interval);
  }, [isActive]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'question_found':
        return <MessageSquare className="h-4 w-4 text-blue-400" />;
      case 'answer_posted':
        return <ArrowUp className="h-4 w-4 text-green-400" />;
      default:
        return <Clock className="h-4 w-4 text-red-400" />;
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'question_found':
        return 'Found new question';
      case 'answer_posted':
        return 'Posted answer';
      default:
        return 'Error occurred';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">Live Activity Feed</CardTitle>
            <CardDescription className="text-slate-400">
              Real-time bot interactions and responses
            </CardDescription>
          </div>
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "🔴 Live" : "⏸️ Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {isActive ? (
                <div>
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Monitoring subreddits for questions...</p>
                  <p className="text-sm">Activity will appear here as the bot works</p>
                </div>
              ) : (
                <div>
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Bot is currently inactive</p>
                  <p className="text-sm">Start the bot to see live activity</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 bg-slate-700 rounded-lg border border-slate-600 hover:bg-slate-600 transition-colors"
                >
                  <div className="mt-1">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {getActivityText(activity)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        r/{activity.subreddit}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 truncate mb-2">
                      {activity.title}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs text-slate-400">
                        <User className="h-3 w-3" />
                        <span>u/{activity.author}</span>
                        {activity.score && (
                          <>
                            <ArrowUp className="h-3 w-3" />
                            <span>{activity.score}</span>
                          </>
                        )}
                      </div>
                      {activity.url && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-400 hover:text-blue-300">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default BotActivity;
