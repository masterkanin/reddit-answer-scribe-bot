
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, CheckCircle, XCircle, Edit, TestTube, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { useBotCredentials } from "@/hooks/useBotCredentials";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface CredentialTestResult {
  success: boolean;
  message: string;
  userData?: {
    name: string;
    id: string;
    has_verified_email: boolean;
    is_suspended: boolean;
    link_karma: number;
    comment_karma: number;
  };
  code?: string;
  troubleshooting?: string[];
}

const RedditAuth: React.FC = () => {
  const { user } = useAuth();
  const { credentials, updateCredentials, isRedditConnected, loading } = useBotCredentials();
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<CredentialTestResult | null>(null);
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
      setTestResult(null); // Clear any previous test results
    }
  };

  const handleTestCredentials = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    if (!formData.clientId || !formData.clientSecret || !formData.username || !formData.password) {
      toast.error("Please fill in all Reddit credentials before testing");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // First save the credentials if they've changed
      await updateCredentials({
        reddit_client_id: formData.clientId,
        reddit_client_secret: formData.clientSecret,
        reddit_username: formData.username,
        reddit_password: formData.password
      });

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Test the credentials
      const { data, error } = await supabase.functions.invoke('reddit-api', {
        body: { action: 'testCredentials' },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data.error || data.code) {
        // Handle structured error response
        setTestResult({
          success: false,
          message: data.message || data.error,
          code: data.code,
          troubleshooting: data.troubleshooting || []
        });
        toast.error(`Credential test failed: ${data.message || data.error}`);
      } else {
        setTestResult({
          success: true,
          message: data.message,
          userData: data.userData
        });
        toast.success("Reddit credentials are working correctly!");
      }
    } catch (error: any) {
      console.error('Credential test error:', error);
      setTestResult({
        success: false,
        message: error.message || 'Failed to test credentials',
        troubleshooting: [
          'Check your internet connection',
          'Verify all credentials are entered correctly',
          'Try again in a few minutes'
        ]
      });
      toast.error(`Test failed: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear test results when credentials change
    if (testResult) {
      setTestResult(null);
    }
  };

  const handleEditCredentials = () => {
    setIsEditing(true);
    setTestResult(null);
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
    setTestResult(null);
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
              {user && (
                <Button 
                  onClick={handleTestCredentials}
                  disabled={isTesting || !formData.clientId || !formData.clientSecret || !formData.username || !formData.password}
                  variant="outline"
                  className="text-slate-300 border-slate-600 hover:bg-slate-700"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {isTesting ? 'Testing...' : 'Test'}
                </Button>
              )}
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

            {/* Test Results */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-900/30 border-green-600' 
                  : 'bg-red-900/30 border-red-600'
              }`}>
                <div className="flex items-center space-x-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`font-medium ${
                    testResult.success ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
                  </span>
                </div>
                <p className={`text-sm mb-3 ${
                  testResult.success ? 'text-green-200' : 'text-red-200'
                }`}>
                  {testResult.message}
                </p>

                {testResult.userData && (
                  <div className="bg-slate-800/50 p-3 rounded mb-3">
                    <h4 className="text-green-400 font-medium mb-2">Account Information:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-slate-300">Username: {testResult.userData.name}</div>
                      <div className="text-slate-300">ID: {testResult.userData.id}</div>
                      <div className="text-slate-300">
                        Email Verified: {testResult.userData.has_verified_email ? '✅' : '❌'}
                      </div>
                      <div className="text-slate-300">
                        Suspended: {testResult.userData.is_suspended ? '❌' : '✅'}
                      </div>
                      <div className="text-slate-300">Link Karma: {testResult.userData.link_karma}</div>
                      <div className="text-slate-300">Comment Karma: {testResult.userData.comment_karma}</div>
                    </div>
                  </div>
                )}

                {testResult.troubleshooting && testResult.troubleshooting.length > 0 && (
                  <div className="bg-slate-800/50 p-3 rounded">
                    <h4 className="text-yellow-400 font-medium mb-2 flex items-center">
                      <Info className="h-4 w-4 mr-1" />
                      Troubleshooting Tips:
                    </h4>
                    <ul className="text-sm text-slate-300 space-y-1">
                      {testResult.troubleshooting.map((tip, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-yellow-400 mr-2">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
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
              <Button 
                onClick={handleTestCredentials}
                disabled={isTesting}
                variant="outline"
                className="text-slate-300 border-slate-600 hover:bg-slate-700"
              >
                <TestTube className="h-4 w-4 mr-2" />
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>

            {/* Test Results for connected state */}
            {testResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-900/30 border-green-600' 
                  : 'bg-red-900/30 border-red-600'
              }`}>
                <div className="flex items-center space-x-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`font-medium ${
                    testResult.success ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {testResult.success ? 'Connection Verified' : 'Connection Failed'}
                  </span>
                </div>
                <p className={`text-sm ${
                  testResult.success ? 'text-green-200' : 'text-red-200'
                }`}>
                  {testResult.message}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RedditAuth;
