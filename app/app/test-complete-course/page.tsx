"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TestCompleteCoursePage() {
  const [courseId, setCourseId] = useState("4a25c12d-fc4f-4eae-8053-e1b0bff5d27e");
  const [assignmentId, setAssignmentId] = useState("0199a374-61cb-479e-a0c0-931e9a9d6c04");
  const [debugData, setDebugData] = useState<any>(null);
  const [completeResult, setCompleteResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testDebugEndpoint = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/complete/test?assignmentId=${assignmentId}`);
      const data = await response.json();
      setDebugData(data);
    } catch (error: any) {
      setDebugData({ error: error.message });
    }
    setLoading(false);
  };

  const testCompleteEndpoint = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId
        }),
      });
      const data = await response.json();
      setCompleteResult({
        status: response.status,
        statusText: response.statusText,
        data
      });
    } catch (error: any) {
      setCompleteResult({ error: error.message });
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Complete Course Functionality</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="courseId">Course ID</Label>
            <Input
              id="courseId"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="Enter course ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignmentId">Assignment ID (Trainee)</Label>
            <Input
              id="assignmentId"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              placeholder="Enter assignment ID"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={testDebugEndpoint} 
              disabled={loading}
            >
              Test Debug Endpoint
            </Button>
            <Button 
              onClick={testCompleteEndpoint} 
              disabled={loading}
              variant="destructive"
            >
              Test Complete Course
            </Button>
          </div>
        </CardContent>
      </Card>

      {debugData && (
        <Card>
          <CardHeader>
            <CardTitle>Debug Data</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {completeResult && (
        <Card>
          <CardHeader>
            <CardTitle>Complete Course Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(completeResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>Test with these assignments:</p>
          <div className="space-y-1 text-sm">
            <div>Course: 4a25c12d-fc4f-4eae-8053-e1b0bff5d27e</div>
            <div>Assignment (trainee): 0199a374-61cb-479e-a0c0-931e9a9d6c04</div>
            <a 
              href={`/app/train-assess/course/${courseId}?trainee=${assignmentId}&type=assessment`}
              target="_blank"
              className="text-blue-600 underline"
            >
              Open Assessment Page →
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}