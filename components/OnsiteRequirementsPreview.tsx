"use client";

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Requirement = {
  id: string;
  label: string | null;
  field_type: string | null;
  required: boolean | null;
  help_text: string | null;
  role: "onsite_trainer" | "onsite_assessor" | "trainer" | "assessor";
};

type OnsiteRequirementsPreviewProps = {
  moduleId: string;
  moduleTitle: string;
  moduleType: "onsite_training" | "onsite_assessment";
};

export default function OnsiteRequirementsPreview({ 
  moduleId, 
  moduleTitle, 
  moduleType 
}: OnsiteRequirementsPreviewProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRequirements() {
      try {
        const { data, error } = await supabaseBrowser
          .from('onsite_requirements')
          .select('id, label, field_type, required, help_text, role')
          .eq('module_id', moduleId)
          .order('order_index', { ascending: true });

        if (error) {
          console.error('Error fetching onsite requirements:', error);
        } else {
          setRequirements(data || []);
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchRequirements();
  }, [moduleId]);

  const isTraining = moduleType === "onsite_training";
  const sessionType = isTraining ? "Training" : "Assessment";
  const relevantRequirements = requirements.filter(req => 
    isTraining 
      ? (req.role === "onsite_trainer" || req.role === "trainer")
      : (req.role === "onsite_assessor" || req.role === "assessor")
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex-shrink-0">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-blue-900">
            Onsite {sessionType} Session
          </h3>
          <p className="text-sm text-blue-700 mt-1">
            This is a practical {sessionType.toLowerCase()} session that must be completed in person with a qualified {isTraining ? 'trainer' : 'assessor'}.
          </p>
        </div>
      </div>

      {/* Requirements Section */}
      {relevantRequirements.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-900">
            {sessionType} Requirements:
          </h4>
          
          <div className="space-y-3">
            {relevantRequirements.map((requirement) => (
              <div key={requirement.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-md border">
                <div className="flex-shrink-0 mt-0.5">
                  {requirement.field_type === 'checkbox' ? (
                    <input 
                      type="checkbox" 
                      disabled 
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                  ) : requirement.field_type === 'rating' ? (
                    <div className="flex space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg key={star} className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  ) : (
                    <div className="w-4 h-4 border border-gray-300 rounded bg-gray-100"></div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {requirement.label}
                    {requirement.required && (
                      <span className="ml-1 text-red-500 text-xs">*</span>
                    )}
                  </p>
                  
                  {requirement.help_text && (
                    <p className="text-xs text-gray-600 mt-1">
                      {requirement.help_text}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800">
                      {requirement.field_type}
                    </span>
                    {requirement.required && (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-red-100 text-red-700">
                        Required
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-2">
                <p className="text-sm text-yellow-800">
                  <strong>Preview Mode:</strong> This is how the {sessionType.toLowerCase()} requirements will appear to the {isTraining ? 'trainer' : 'assessor'} during the actual session. In live sessions, these items will be interactive and completable.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Requirements Set</h3>
            <p className="mt-1 text-sm text-gray-500">
              No {sessionType.toLowerCase()} requirements have been configured for this module yet.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Requirements can be added in the module builder to define what {isTraining ? 'trainers' : 'assessors'} need to complete during onsite sessions.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}