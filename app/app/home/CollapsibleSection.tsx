'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  variant?: 'available' | 'updates' | 'planned';
}

export default function CollapsibleSection({ 
  title, 
  subtitle,
  defaultOpen = false, 
  children,
  variant = 'available'
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const getVariantStyles = () => {
    switch (variant) {
      case 'available':
        return 'text-green-700';
      case 'updates':
        return 'text-purple-700';
      case 'planned':
        return 'text-blue-700';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <div className="rounded-xl border bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 text-left hover:bg-gray-50 transition-colors rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className={`font-medium ${getVariantStyles()}`}>{title}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
          </div>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 border-t">
          {children}
        </div>
      )}
    </div>
  );
}