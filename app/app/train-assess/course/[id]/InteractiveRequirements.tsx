
"use client";

import { useState } from "react";
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
      await onSave(moduleId, assignmentId, responses);
      alert("Responses saved successfully!");
    } catch (error) {
      console.error("Failed to save responses:", error);
      alert("Failed to save responses. Please try again.");
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

  const allRequiredFieldsCompleted = requirements
    .filter(req => req.required)
    .every(req => {
      const response = responses[req.id];
      if (req.field_type === 'checkbox') return response === true;
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
            disabled={isSaving || !allRequiredFieldsCompleted}
            className="min-w-[120px]"
          >
            {isSaving ? 'Saving...' : 'Save Progress'}
          </Button>
        </div>
      )}
    </div>
  );
}
