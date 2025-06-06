
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, CheckCircle, XCircle, Edit } from "lucide-react";
import { toast } from "sonner";
import { useBotCredentials } from "@/hooks/useBotCredentials";
import { useAuth } from "@/hooks/useAuth";

const RedditAuth: React.FC = () => {
  const { user } = useAuth();
  const { credentials, updateCredentials, isRedditConnected, loading } = useBotCredentials();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
    username: '',
    password: ''
  });

  React.useEffect(() => {
    if (credentials) {
      setFormData({
        clientId: credentials.reddit_client_id || '',
        clientSecret: credentials.reddit_client_secret || '',
        username: credentials.reddit_username || '',
        password: credentials.reddit_password || ''
      });
    }
  }, [credentials]);

  const handleConnect = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    if (!formData.clientId || !formData.clientSecret || !formData.username || !formData.password) {
      toast.error("Please fill in all Reddit credentials");
      return;
    }
    
    const success = await updateCredentials({
      reddit_client_id: formData.clientId,
      reddit_client_secret: formData.clientSecret,
      reddit_username: formData.username,
      reddit_password: formData.password
    });

    if (success) {
      toast.success("Reddit credentials saved successfully!");
      setIsEditing(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEditCredentials = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // Reset form data to current credentials
    if (credentials) {
      setFormData({
        clientId: credentials.reddit_client_id || '',
        clientSecret: credentials.reddit_client_secret || '',
        username: credentials.reddit_username || '',
        password: credentials.reddit_password || ''
      });
    }
    setIsEditing(false);
  };

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="text-center text-slate-400">Loading credentials...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageCircle className="h-6 w-6 text-orange-500" />
            <div>
              <CardTitle className="text-white">Reddit Connection</CardTitle>
              <CardDescription className="text-slate-400">
                Connect your Reddit account and API credentials
              </CardDescription>
            </div>
          </div>
          {isRedditConnected() ? (
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
        {!isRedditConnected() || !user || isEditing ? (
          <>
            {!user && (
              <div className="text-center py-4 text-slate-400">
                Please sign in to save your Reddit credentials
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientId" className="text-slate-300">Client ID</Label>
                <Input
                  id="clientId"
                  placeholder="Reddit app client ID"
                  value={formData.clientId}
                  onChange={(e) => handleInputChange('clientId', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  disabled={!user}
                />
              </div>
              <div>
                <Label htmlFor="clientSecret" className="text-slate-300">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="Reddit app client secret"
                  value={formData.clientSecret}
                  onChange={(e) => handleInputChange('clientSecret', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  disabled={!user}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username" className="text-slate-300">Username</Label>
                <Input
                  id="username"
                  placeholder="Reddit username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  disabled={!user}
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Reddit password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  disabled={!user}
                />
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleConnect} 
                className="flex-1 bg-orange-600 hover:bg-orange-700"
                disabled={!user}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {user ? 'Save Reddit Credentials' : 'Sign In to Connect Reddit'}
              </Button>
              {isEditing && (
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
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-green-400 font-medium">Successfully connected to Reddit</p>
            <p className="text-slate-400 text-sm mb-4">Bot can now monitor subreddits and post answers</p>
            <div className="flex space-x-2 justify-center">
              <Button 
                onClick={handleEditCredentials}
                variant="outline"
                className="text-slate-300 border-slate-600 hover:bg-slate-700"
              >
                <Edit className="h-4 w-4 mr-2" />
                Update Credentials
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RedditAuth;
