"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

interface TestCompleteButtonProps {
  courseId: string;
  assignmentId: string;
}

export default function TestCompleteButton({ courseId, assignmentId }: TestCompleteButtonProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCompleteCourse = async () => {
    if (isCompleting) return;
    
    setIsCompleting(true);
    
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
      
      setResult({
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        data: data
      });

      if (response.ok) {
        alert('Course completed successfully!');
      } else {
        alert(`Error: ${data.error || 'Failed to complete course'}`);
      }
    } catch (error) {
      console.error('Failed to complete course:', error);
      setResult({ error: error.message });
      alert('Failed to complete course. Check console for details.');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button 
        onClick={handleCompleteCourse}
        disabled={isCompleting}
        className="bg-green-600 hover:bg-green-700"
      >
        {isCompleting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Completing Course...
          </>
        ) : (
          <>
            <CheckCircle className="mr-2 h-4 w-4" />
            Test Complete Course
          </>
        )}
      </Button>
      
      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-semibold mb-2">Result:</h3>
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}