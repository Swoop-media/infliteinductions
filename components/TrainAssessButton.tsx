'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { ArrowRight } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface TrainAssessButtonProps {
  href: string;
  variant?: 'default' | 'outline';
  type: 'training' | 'assessment';
}

export default function TrainAssessButton({ href, variant = 'default', type }: TrainAssessButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleClick = () => {
    setIsLoading(true);
    router.push(href);
  };

  const buttonText = type === 'training' ? 'Start Training' : 'Start Assessment';

  if (isLoading) {
    return (
      <Button size="sm" variant={variant} disabled>
        <LoadingSpinner size="small" message="" />
        <span className="ml-2">Loading...</span>
      </Button>
    );
  }

  return (
    <Button size="sm" variant={variant} onClick={handleClick}>
      {buttonText}
      <ArrowRight className="h-4 w-4 ml-2" />
    </Button>
  );
}