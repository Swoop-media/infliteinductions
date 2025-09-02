
'use client';

import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface CompleteModuleButtonProps {
  moduleId: string;
  assignmentId: string;
  sessionType: 'training' | 'assessment';
  isCompleted: boolean;
}

export default function CompleteModuleButton({ 
  moduleId, 
  assignmentId, 
  sessionType, 
  isCompleted 
}: CompleteModuleButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleCompleteModule = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/assignment/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: assignmentId,
          moduleId: moduleId,
        }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        console.error('Failed to complete module');
      }
    } catch (error) {
      console.error('Error completing module:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isCompleted) {
    return null;
  }

  return (
    <Button
      onClick={handleCompleteModule}
      size="sm"
      disabled={isLoading}
    >
      <Play className="h-4 w-4 mr-2" />
      {isLoading ? 'Completing...' : 
        sessionType === 'training' ? 'Complete Training' : 'Complete Assessment'
      }
    </Button>
  );
}
