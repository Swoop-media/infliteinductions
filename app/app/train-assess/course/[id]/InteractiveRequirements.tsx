// @ts-nocheck

"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface Requirement {
  id: string;
  module_id: string;
  role: string;
  label: string | null;
  field_type: string | null;
  options: any;
  required: boolean | null;
  help_text: string | null;
}

interface InteractiveRequirementsProps {
  requirements: Requirement[];
  moduleId: string;
  isCompleted: boolean;
  sessionType: string;
  assignmentId: string;
  onSave: (moduleId: string, assignmentId: string, responses: Record<string, any>) => Promise<void>;
}

export default function InteractiveRequirements({
  requirements,
  moduleId,
  isCompleted,
  sessionType,
  assignmentId,
  onSave
}: InteractiveRequirementsProps) {
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [selectedRatings, setSelectedRatings] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing responses when component mounts
  useEffect(() => {
    const loadExistingResponses = async () => {
      try {
        const response = await fetch(`/api/requirement-responses?moduleId=${moduleId}&assignmentId=${assignmentId}`);
        if (response.ok) {
          const data = await response.json();
          const existingResponses: Record<string, any> = {};
          const existingRatings: Record<string, number> = {};
          
          data.responses?.forEach((resp: any) => {
            existingResponses[resp.requirement_id] = resp.response_value;
            if (typeof resp.response_value === 'number' && resp.response_value >= 1 && resp.response_value <= 5) {
              existingRatings[resp.requirement_id] = resp.response_value;
            }
          });
          
          setResponses(existingResponses);
          setSelectedRatings(existingRatings);
        }
      } catch (error) {
        console.error('Failed to load existing responses:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadExistingResponses();
  }, [moduleId, assignmentId]);

  const updateResponse = (requirementId: string, value: any) => {
    setResponses(prev => ({
      ...prev,
      [requirementId]: value
    }));
  };

  const updateRating = (requirementId: string, rating: number) => {
    setSelectedRatings(prev => ({
      ...prev,
      [requirementId]: rating
    }));
    updateResponse(requirementId, rating);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Check if there are any file uploads
      const hasFileUploads = Object.entries(responses).some(
        ([_, value]) => value instanceof File
      );

      if (hasFileUploads) {
        // Use FormData for file uploads
        const formData = new FormData();
        formData.append('moduleId', moduleId);
        formData.append('assignmentId', assignmentId);
        
        const regularResponses: Record<string, any> = {};
        
        // Separate files from regular responses
        for (const [reqId, value] of Object.entries(responses)) {
          if (value instanceof File) {
            formData.append(`file_${reqId}`, value);
          } else {
            regularResponses[reqId] = value;
          }
        }
        
        formData.append('responses', JSON.stringify(regularResponses));
        
        // Save with file uploads
        const uploadResponse = await fetch('/api/requirement-responses-upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Failed to upload files');
        }
      } else {
        // Save regular responses without files
        await onSave(moduleId, assignmentId, responses);
      }
      
      // Mark module as completed and handle progression
      const progressResponse = await fetch('/api/assignment/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: assignmentId,
          moduleId: moduleId,
          completed: true,
        }),
      });

      if (progressResponse.ok) {
        const result = await progressResponse.json();
        console.log('Module completed successfully:', result);
        
        // Force a page refresh to show updated progress and handle progression
        window.location.reload();
      } else {
        let errorMessage = 'Failed to complete module. Please try again.';
        try {
          const error = await progressResponse.json();
          errorMessage = error.error || error.message || errorMessage;
          console.error('Failed to complete module:', {
            error,
            status: progressResponse.status,
            statusText: progressResponse.statusText,
            assignmentId,
            moduleId
          });
          
          // Show more specific error messages to users
          if (error.error === 'Assignment not found') {
            errorMessage = 'Training assignment not found. Please contact your administrator.';
          } else if (error.error === 'Database error while fetching assignment') {
            errorMessage = 'Database error occurred. Please try again or contact support.';
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          console.error('Response details:', {
            status: progressResponse.status,
            statusText: progressResponse.statusText,
            assignmentId,
            moduleId
          });
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Failed to save responses:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save responses. Please try again.";
      alert(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const renderFieldControl = (req: Requirement) => {
    if (isCompleted) {
      return (
        <div className="mt-3 flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">Completed</span>
        </div>
      );
    }

    switch (req.field_type) {
      case 'checkbox':
        return (
          <div className="mt-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`req-${req.id}`}
                checked={responses[req.id] || false}
                onChange={(e) => updateResponse(req.id, e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor={`req-${req.id}`} className="text-sm text-gray-700">
                Completed
              </label>
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="mt-3">
            <input
              type="text"
              value={responses[req.id] || ''}
              onChange={(e) => updateResponse(req.id, e.target.value)}
              placeholder="Enter response..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        );

      case 'select':
        return (
          <div className="mt-3">
            <select 
              value={responses[req.id] || ''}
              onChange={(e) => updateResponse(req.id, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select an option...</option>
              {req.options && Array.isArray(req.options) && req.options.map((option, idx) => (
                <option key={idx} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case 'date':
        return (
          <div className="mt-3">
            <input
              type="date"
              value={responses[req.id] || ''}
              onChange={(e) => updateResponse(req.id, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        );

      case 'rating':
        return (
          <div className="mt-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Rating:</span>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => updateRating(req.id, rating)}
                  className={`transition-colors ${
                    selectedRatings[req.id] >= rating 
                      ? 'text-yellow-400' 
                      : 'text-gray-300 hover:text-yellow-400'
                  }`}
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                </button>
              ))}
              {selectedRatings[req.id] && (
                <span className="text-sm text-gray-600 ml-2">
                  {selectedRatings[req.id]}/5
                </span>
              )}
            </div>
          </div>
        );

      case 'pass_fail':
        return (
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateResponse(req.id, 'pass')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  responses[req.id] === 'pass'
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pass ✓
              </button>
              <button
                type="button"
                onClick={() => updateResponse(req.id, 'fail')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  responses[req.id] === 'fail'
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Fail ✗
              </button>
              {responses[req.id] && (
                <span className={`text-sm font-medium ${
                  responses[req.id] === 'pass' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {responses[req.id] === 'pass' ? 'Pass selected' : 'Fail selected'}
                </span>
              )}
            </div>
          </div>
        );

      case 'file':
        return (
          <div className="mt-3">
            <input
              type="file"
              id={`req-file-${req.id}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  updateResponse(req.id, file);
                }
              }}
              accept="image/*,.pdf,.doc,.docx"
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {responses[req.id] && (
              <p className="text-sm text-gray-600 mt-2">
                {responses[req.id] instanceof File 
                  ? `Selected: ${responses[req.id].name}`
                  : typeof responses[req.id] === 'string' && responses[req.id].includes('requirement-uploads')
                  ? '✓ File previously uploaded'
                  : ''}
              </p>
            )}
            {responses[req.id] && typeof responses[req.id] === 'string' && responses[req.id].includes('requirement-uploads') && (
              <a 
                href={`/api/download-requirement-file?path=${encodeURIComponent(responses[req.id])}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View uploaded file
              </a>
            )}
          </div>
        );

      default:
        return (
          <div className="mt-3">
            <input
              type="text"
              value={responses[req.id] || ''}
              onChange={(e) => updateResponse(req.id, e.target.value)}
              placeholder="Enter response..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        );
    }
  };

  if (requirements.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="text-center text-muted-foreground">
          Loading requirements...
        </div>
      </div>
    );
  }

  const allRequiredFieldsCompleted = requirements
    .filter(req => req.required)
    .every(req => {
      const response = responses[req.id];
      if (req.field_type === 'checkbox') return response === true;
      if (req.field_type === 'pass_fail') return response === 'pass' || response === 'fail';
      return response !== undefined && response !== null && response !== '';
    });

  return (
    <div className="p-4">
      <h4 className="text-sm font-medium text-muted-foreground mb-3">
        {sessionType === 'training' ? 'Training Requirements' : 'Assessment Requirements'}
      </h4>
      <div className="space-y-4">
        {requirements.map((req) => (
          <div key={req.id} className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-start gap-3 mb-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{req.label}</p>
                {req.help_text && (
                  <p className="text-xs text-muted-foreground mt-1">{req.help_text}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {req.field_type}
                  </Badge>
                  {req.required && (
                    <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                      Required
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            {renderFieldControl(req)}
          </div>
        ))}
      </div>
      
      {!isCompleted && (
        <div className="mt-4 flex justify-end">
          <Button 
            onClick={handleSave}
            disabled={isSaving || isLoading || !allRequiredFieldsCompleted}
            className="min-w-[120px]"
          >
            {isSaving ? 'Saving...' : 'Save Progress'}
          </Button>
        </div>
      )}
    </div>
  );
}
