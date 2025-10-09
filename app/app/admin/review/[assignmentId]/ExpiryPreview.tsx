'use client';

import { useMemo } from 'react';
import { 
  calculateAuthorizationExpiry, 
  formatExpiryDate, 
  getDaysUntilExpiry,
  getExpiryStatus 
} from '@/lib/utils/calculateAuthorizationExpiry';

interface ExpiryPreviewProps {
  authValidForDays: number | null;
  documents: Array<{
    expires_on: string | null;
    title?: string;
  }>;
  courses: Array<{
    course_title: string;
    valid_for_months?: number | null;
  }>;
}

export default function ExpiryPreview({ 
  authValidForDays, 
  documents, 
  courses 
}: ExpiryPreviewProps) {
  const expiryInfo = useMemo(() => {
    const approvalDate = new Date(); // Today's date as approval date
    
    const expiryDate = calculateAuthorizationExpiry(
      approvalDate,
      authValidForDays,
      documents,
      courses
    );
    
    if (!expiryDate) {
      return null;
    }
    
    const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
    const status = getExpiryStatus(daysUntilExpiry);
    
    // Find what determines the expiry (earliest date)
    const expiryReasons: string[] = [];
    
    // Check authorization validity
    if (authValidForDays && authValidForDays > 0) {
      const authExpiry = new Date(approvalDate);
      authExpiry.setDate(authExpiry.getDate() + authValidForDays);
      if (Math.abs(authExpiry.getTime() - expiryDate.getTime()) < 86400000) { // within 1 day
        expiryReasons.push(`Authorization validity (${authValidForDays} days)`);
      }
    }
    
    // Check document expiries
    documents.forEach(doc => {
      if (doc.expires_on) {
        const docExpiry = new Date(doc.expires_on);
        if (Math.abs(docExpiry.getTime() - expiryDate.getTime()) < 86400000) { // within 1 day
          expiryReasons.push(`Document: ${doc.title || 'Unnamed'}`);
        }
      }
    });
    
    // Check course expiries
    courses.forEach(course => {
      if (course.valid_for_months && course.valid_for_months > 0) {
        const courseExpiry = new Date(approvalDate);
        courseExpiry.setMonth(courseExpiry.getMonth() + course.valid_for_months);
        if (Math.abs(courseExpiry.getTime() - expiryDate.getTime()) < 86400000) { // within 1 day
          expiryReasons.push(`Course: ${course.course_title} (${course.valid_for_months} months)`);
        }
      }
    });
    
    return {
      expiryDate,
      daysUntilExpiry,
      status,
      reason: expiryReasons[0] || 'Unknown'
    };
  }, [authValidForDays, documents, courses]);
  
  if (!expiryInfo) {
    return (
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="font-medium text-gray-900">Authorization Expiry Preview</h3>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          This authorization will not expire
        </p>
      </div>
    );
  }
  
  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="font-medium text-blue-900">Authorization Expiry Preview</h3>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">If approved today:</span>
          <span className="text-sm font-medium text-gray-900">
            {formatExpiryDate(expiryInfo.expiryDate)}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Status:</span>
          <span className={`text-sm font-medium ${expiryInfo.status.color}`}>
            {expiryInfo.status.text}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Determined by:</span>
          <span className="text-sm text-gray-600 text-right max-w-[60%]">
            {expiryInfo.reason}
          </span>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-blue-200">
        <p className="text-xs text-blue-700">
          The authorization will expire on the earliest of: document expiry, course expiry, or authorization validity period
        </p>
      </div>
    </div>
  );
}