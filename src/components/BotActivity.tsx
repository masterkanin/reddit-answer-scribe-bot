
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MessageSquare, ExternalLink, Clock, User, ArrowUp, CheckCircle, XCircle } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ActivityItem {
  id: string;
  type: 'answer_posted' | 'answer_failed';
  subreddit: string;
  title: string;
  author: string;
  timestamp: Date;
  url?: string;
  score?: number;
  status: string;
}

interface BotActivityProps {
  isActive: boolean;
}

const BotActivity: React.FC<BotActivityProps> = ({ isActive }) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Fetch real activities from database
  const fetchActivities = async () => {
    if (!user) {
      setActivities([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('questions_answered')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching activities:', error);
        return;
      }

      const formattedActivities: ActivityItem[] = (data || []).map(item => ({
        id: item.id,
        type: item.status === 'posted' ? 'answer_posted' : 'answer_failed',
        subreddit: item.subreddit_name,
        title: item.question_title,
        author: item.question_author,
        timestamp: new Date(item.created_at),
        url: item.reddit_comment_id ? `https://reddit.com/r/${item.subreddit_name}/comments/${item.reddit_post_id}/_/${item.reddit_comment_id}` : undefined,
        score: (item.upvotes || 0) - (item.downvotes || 0),
        status: item.status,
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  // Set up real-time subscription for new activities
  useEffect(() => {
    if (!user) return;

    fetchActivities();

    const channel = supabase
      .channel('questions_answered_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'questions_answered',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('New activity:', payload);
          const newActivity: ActivityItem = {
            id: payload.new.id,
            type: payload.new.status === 'posted' ? 'answer_posted' : 'answer_failed',
            subreddit: payload.new.subreddit_name,
            title: payload.new.question_title,
            author: payload.new.question_author,
            timestamp: new Date(payload.new.created_at),
            url: payload.new.reddit_comment_id ? 
              `https://reddit.com/r/${payload.new.subreddit_name}/comments/${payload.new.reddit_post_id}/_/${payload.new.reddit_comment_id}` : 
              undefined,
            score: (payload.new.upvotes || 0) - (payload.new.downvotes || 0),
            status: payload.new.status,
          };
          
          setActivities(prev => [newActivity, ...prev.slice(0, 19)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getActivityIcon = (type: string, status: string) => {
    if (type === 'answer_posted' && status === 'posted') {
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    if (activity.type === 'answer_posted' && activity.status === 'posted') {
      return 'Posted answer';
    } else {
      return 'Failed to post answer';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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
                  <p>No recent activity</p>
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
                    {getActivityIcon(activity.type, activity.status)}
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
                        {activity.score !== undefined && activity.status === 'posted' && (
                          <>
                            <ArrowUp className="h-3 w-3" />
                            <span>{activity.score}</span>
                          </>
                        )}
                      </div>
                      {activity.url && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-blue-400 hover:text-blue-300"
                          onClick={() => window.open(activity.url, '_blank')}
                        >
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
