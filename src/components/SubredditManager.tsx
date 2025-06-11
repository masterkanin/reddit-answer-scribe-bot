
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface SubredditManagerProps {
  subreddits: string[];
  setSubreddits: (subreddits: string[]) => void;
  isAuthenticated: boolean;
}

const SubredditManager: React.FC<SubredditManagerProps> = ({ 
  subreddits, 
  setSubreddits, 
  isAuthenticated 
}) => {
  const [newSubreddit, setNewSubreddit] = useState('');

  const addSubreddit = () => {
    if (!newSubreddit.trim()) {
      toast.error("Please enter a subreddit name");
      return;
    }
    
    const cleanName = newSubreddit.replace(/^r\//, '').trim();
    
    if (subreddits.includes(cleanName)) {
      toast.error("This subreddit is already being monitored");
      return;
    }
    
    setSubreddits([...subreddits, cleanName]);
    setNewSubreddit('');
    toast.success(`Added r/${cleanName} to monitoring list`);
  };

  const removeSubreddit = (subredditToRemove: string) => {
    setSubreddits(subreddits.filter(sub => sub !== subredditToRemove));
    toast.success(`Removed r/${subredditToRemove} from monitoring`);
  };

  const getSubredditStats = (subreddit: string) => {
    // Mock data for demonstration
    const mockData = {
      members: Math.floor(Math.random() * 1000000) + 100000,
      questionsToday: Math.floor(Math.random() * 50) + 5,
      answeredByBot: Math.floor(Math.random() * 10) + 1
    };
    return mockData;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Add New Subreddit</CardTitle>
          <CardDescription className="text-slate-400">
            Add subreddits for the bot to monitor persistently for questions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400">r/</span>
              <Input
                placeholder="AskReddit"
                value={newSubreddit}
                onChange={(e) => setNewSubreddit(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSubreddit()}
                className="pl-8 bg-slate-700 border-slate-600 text-white"
                disabled={!isAuthenticated}
              />
            </div>
            <Button 
              onClick={addSubreddit}
              disabled={!isAuthenticated}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
          {!isAuthenticated && (
            <p className="text-sm text-yellow-400 mt-2">
              Connect to Reddit first to manage subreddits
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Monitored Subreddits ({subreddits.length})</CardTitle>
          <CardDescription className="text-slate-400">
            Subreddits being monitored persistently by the server-side bot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {subreddits.map((subreddit) => {
                const stats = getSubredditStats(subreddit);
                return (
                  <div
                    key={subreddit}
                    className="flex items-center justify-between p-4 bg-slate-700 rounded-lg border border-slate-600"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-white font-medium">r/{subreddit}</h3>
                        <Badge variant="outline" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {stats.members.toLocaleString()}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-slate-400">
                        <span className="flex items-center">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {stats.questionsToday} questions today
                        </span>
                        <span className="text-green-400">
                          {stats.answeredByBot} answered by bot
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeSubreddit(subreddit)}
                      disabled={!isAuthenticated}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {subreddits.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <p>No subreddits added yet.</p>
                  <p className="text-sm mt-2">Add subreddits above to start monitoring questions.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubredditManager;
