"use client";

import { useState, useEffect, useRef } from "react";

interface EquipmentRequirement {
  id: string;
  equipment_name: string;
  description: string | null;
  category: string | null;
  required: boolean;
  order_index: number;
}

interface TraineeResponse {
  equipment_id: string;
  response_text: string;
}

interface EquipmentFormBlockProps {
  courseId: string;
  blockData: any;
  preview?: boolean;
}

export default function EquipmentFormBlock({ 
  courseId, 
  blockData, 
  preview = false 
}: EquipmentFormBlockProps) {
  const [equipment, setEquipment] = useState<EquipmentRequirement[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true); // Will be set properly after data loads
  const [userExpanded, setUserExpanded] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const previousCompleted = useRef(false);
  const currentCourseId = useRef(courseId);

  useEffect(() => {
    // Reset state when course changes
    if (currentCourseId.current !== courseId) {
      setHasInitialized(false);
      setUserExpanded(false);
      previousCompleted.current = false;
      setIsExpanded(true);
      currentCourseId.current = courseId;
    }
    
    loadEquipmentRequirements();
    if (!preview) {
      loadTraineeResponses();
    } else {
      setResponsesLoading(false); // No need to load responses in preview mode
    }
  }, [courseId, preview]);

  // Initialize form state after both equipment and responses are loaded
  useEffect(() => {
    const bothLoaded = !equipmentLoading && !responsesLoading;
    
    if (!preview && bothLoaded && equipment.length > 0 && !hasInitialized) {
      const requiredItems = equipment.filter(item => item.required);
      const completedRequired = requiredItems.filter(item => responses[item.id]?.trim()).length;
      const isFormCompleted = requiredItems.length > 0 && completedRequired === requiredItems.length;
      
      // Initialize form state based on whether responses exist
      if (isFormCompleted) {
        setIsExpanded(false); // Start collapsed if already completed
      } else {
        setIsExpanded(true);  // Start expanded if incomplete
      }
      
      previousCompleted.current = isFormCompleted;
      setHasInitialized(true);
    } else if (!preview && bothLoaded && equipment.length > 0 && hasInitialized) {
      // Handle transitions after initialization
      const requiredItems = equipment.filter(item => item.required);
      const completedRequired = requiredItems.filter(item => responses[item.id]?.trim()).length;
      const isFormCompleted = requiredItems.length > 0 && completedRequired === requiredItems.length;
      
      // Only collapse on transition from incomplete→complete, and not if user manually expanded
      if (isFormCompleted && !previousCompleted.current && !userExpanded) {
        setIsExpanded(false);
      }
      
      // Reset userExpanded flag if form becomes incomplete
      if (!isFormCompleted && userExpanded) {
        setUserExpanded(false);
      }
      
      previousCompleted.current = isFormCompleted;
    }
  }, [equipment, responses, preview, userExpanded, hasInitialized, equipmentLoading, responsesLoading]);

  const loadEquipmentRequirements = async () => {
    setEquipmentLoading(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment`);
      if (response.ok) {
        const data = await response.json();
        setEquipment(data || []);
      }
    } catch (error) {
      console.error("Error loading equipment requirements:", error);
    } finally {
      setEquipmentLoading(false);
    }
  };

  const loadTraineeResponses = async () => {
    setResponsesLoading(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment/responses`);
      if (response.ok) {
        const data = await response.json();
        const responseMap: Record<string, string> = {};
        data.forEach((resp: any) => {
          responseMap[resp.equipment_id] = resp.response_text || '';
        });
        setResponses(responseMap);
      }
    } catch (error) {
      console.error("Error loading trainee responses:", error);
    } finally {
      setResponsesLoading(false);
    }
  };

  const handleResponseChange = (equipmentId: string, value: string) => {
    setResponses(prev => ({ ...prev, [equipmentId]: value }));
  };

  const saveResponse = async (equipmentId: string) => {
    if (preview) return;
    
    setSaving(true);
    try {
      await fetch(`/api/courses/${courseId}/equipment/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipment_id: equipmentId,
          response_text: responses[equipmentId] || ''
        })
      });
    } catch (error) {
      console.error("Error saving response:", error);
    } finally {
      setSaving(false);
    }
  };

  // Don't render until both data loads AND initialization is complete (prevents flash)
  const loading = equipmentLoading || responsesLoading || (!preview && equipment.length > 0 && !hasInitialized);
  
  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
            🔧
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Equipment Requirements</h3>
        </div>
        <p className="text-slate-700">Loading equipment requirements...</p>
      </div>
    );
  }

  // Check if form is completed (all required items have responses)
  const requiredItems = equipment.filter(item => item.required);
  const completedRequired = requiredItems.filter(item => responses[item.id]?.trim()).length;
  const isFormCompleted = requiredItems.length > 0 && completedRequired === requiredItems.length;

  // If form is completed and not in preview mode, show collapsed view by default
  const shouldShowCollapsed = isFormCompleted && !preview && !isExpanded;

  if (shouldShowCollapsed) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              ✅
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-900">
                {blockData?.title || "Equipment Requirements"}
              </h3>
              <p className="text-sm text-green-600">
                Equipment information submitted ({completedRequired}/{requiredItems.length} items)
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsExpanded(true);
                setUserExpanded(true);
              }}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
            >
              Review & Update Equipment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
          🔧
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {blockData?.title || "Equipment Requirements"}
          </h3>
          {preview && (
            <p className="text-xs text-slate-600">Preview Mode - Equipment requirements below</p>
          )}
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-slate-400 text-4xl mb-2">📋</div>
          <p className="text-slate-700 font-medium">No Equipment Requirements</p>
          <p className="text-slate-600 text-sm">No equipment has been specified for this training.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-slate-700 text-sm">
            Please ensure you have the following equipment before starting:
          </p>
          
          <div className="space-y-4">
            {equipment
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((item) => (
                <div key={item.id} className="bg-white rounded-md border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900">{item.equipment_name}</h4>
                        {item.required && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                        {item.category && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {item.category}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                      )}
                    </div>
                    <div className="text-2xl">
                      {responses[item.id] ? "✅" : (item.required ? "⏳" : "📝")}
                    </div>
                  </div>
                  
                  {!preview && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Provide details about your {item.equipment_name.toLowerCase()}:
                      </label>
                      <textarea
                        value={responses[item.id] || ''}
                        onChange={(e) => handleResponseChange(item.id, e.target.value)}
                        onBlur={() => saveResponse(item.id)}
                        placeholder={item.description ? `${item.description}` : `Describe your ${item.equipment_name.toLowerCase()}...`}
                        className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        disabled={saving}
                      />
                      {saving && (
                        <p className="text-xs text-gray-500">Saving...</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {!preview && (
            <div className="bg-white rounded-md border border-slate-100 p-4 mt-4">
              <div className="flex items-center gap-2 text-slate-700">
                <div className="w-5 h-5">ℹ️</div>
                <p className="text-sm font-medium">Equipment Information Completed?</p>
              </div>
              <p className="text-slate-600 text-sm mt-1">
                Please fill in details for all required equipment items above. Your responses are automatically saved as you type.
              </p>
              {equipment.filter(item => item.required).length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-gray-600">
                    Required items completed: {equipment.filter(item => item.required && responses[item.id]?.trim()).length} of {equipment.filter(item => item.required).length}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}