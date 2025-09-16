"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface CompleteCourseButtonProps {
  courseId: string;
  assignmentId: string;
  traineeName: string;
}

export default function CompleteCourseButton({ 
  courseId, 
  assignmentId, 
  traineeName 
}: CompleteCourseButtonProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const router = useRouter();

  const handleCompleteCourse = async () => {
    if (isCompleting) return;
    
    const confirmed = confirm(
      `Are you sure you want to mark this course as completed for ${traineeName}? ` +
      `This will finalize all assessments and update the trainee's records.`
    );
    
    if (!confirmed) return;
    
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to complete course');
      }

      // Refresh the page to show the updated status
      router.refresh();
      
      // Show success message
      alert(`Course successfully completed for ${traineeName}!`);
    } catch (error) {
      console.error('Failed to complete course:', error);
      alert('Failed to complete course. Please try again.');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
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
          Complete Course
        </>
      )}
    </Button>
  );
}