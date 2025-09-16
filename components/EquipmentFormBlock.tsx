"use client";

import { useState, useEffect } from "react";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEquipmentRequirements();
    if (!preview) {
      loadTraineeResponses();
    }
  }, [courseId, preview]);

  const loadEquipmentRequirements = async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment`);
      if (response.ok) {
        const data = await response.json();
        setEquipment(data || []);
      }
    } catch (error) {
      console.error("Error loading equipment requirements:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTraineeResponses = async () => {
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

  if (loading) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
            🔧
          </div>
          <h3 className="text-lg font-semibold text-orange-900">Equipment Requirements</h3>
        </div>
        <p className="text-orange-700">Loading equipment requirements...</p>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
          🔧
        </div>
        <div>
          <h3 className="text-lg font-semibold text-orange-900">
            {blockData?.title || "Equipment Requirements"}
          </h3>
          {preview && (
            <p className="text-xs text-orange-600">Preview Mode - Equipment requirements below</p>
          )}
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-orange-400 text-4xl mb-2">📋</div>
          <p className="text-orange-700 font-medium">No Equipment Requirements</p>
          <p className="text-orange-600 text-sm">No equipment has been specified for this training.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-orange-700 text-sm">
            Please ensure you have the following equipment before starting:
          </p>
          
          <div className="space-y-4">
            {equipment
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((item) => (
                <div key={item.id} className="bg-white rounded-md border border-orange-100 p-4">
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
                      {responses[item.id] ? "✅" : (item.required ? "❗" : "➡️")}
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
                        className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
            <div className="bg-white rounded-md border border-orange-100 p-4 mt-4">
              <div className="flex items-center gap-2 text-orange-700">
                <div className="w-5 h-5">ℹ️</div>
                <p className="text-sm font-medium">Equipment Information Completed?</p>
              </div>
              <p className="text-orange-600 text-sm mt-1">
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