
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface RedditAuthProps {
  isAuthenticated: boolean;
  onAuthenticate: () => void;
}

const RedditAuth: React.FC<RedditAuthProps> = ({ isAuthenticated, onAuthenticate }) => {
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    username: '',
    password: ''
  });

  const handleConnect = () => {
    if (!credentials.clientId || !credentials.clientSecret || !credentials.username || !credentials.password) {
      toast.error("Please fill in all Reddit credentials");
      return;
    }
    
    // Simulate API connection
    setTimeout(() => {
      onAuthenticate();
    }, 1500);
    
    toast.loading("Connecting to Reddit...", { duration: 1500 });
  };

  const handleInputChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

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
          {isAuthenticated ? (
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
        {!isAuthenticated ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="clientId" className="text-slate-300">Client ID</Label>
                <Input
                  id="clientId"
                  placeholder="Reddit app client ID"
                  value={credentials.clientId}
                  onChange={(e) => handleInputChange('clientId', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="clientSecret" className="text-slate-300">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder="Reddit app client secret"
                  value={credentials.clientSecret}
                  onChange={(e) => handleInputChange('clientSecret', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username" className="text-slate-300">Username</Label>
                <Input
                  id="username"
                  placeholder="Reddit username"
                  value={credentials.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Reddit password"
                  value={credentials.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
            </div>
            
            <Button onClick={handleConnect} className="w-full bg-orange-600 hover:bg-orange-700">
              <MessageCircle className="h-4 w-4 mr-2" />
              Connect to Reddit
            </Button>
          </>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <p className="text-green-400 font-medium">Successfully connected to Reddit</p>
            <p className="text-slate-400 text-sm">Bot can now monitor subreddits and post answers</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RedditAuth;
