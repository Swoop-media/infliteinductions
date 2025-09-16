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
  response_text: string | null;
  user_id: string;
}

interface AssessorConfirmation {
  equipment_id: string;
  confirmed: boolean;
  assessor_notes: string | null;
}

interface AssessorEquipmentCheckBlockProps {
  courseId: string;
  traineeId: string;
  blockData: any;
  onSubmit?: (confirmations: AssessorConfirmation[]) => void;
}

export default function AssessorEquipmentCheckBlock({ 
  courseId, 
  traineeId,
  blockData,
  onSubmit
}: AssessorEquipmentCheckBlockProps) {
  const [equipment, setEquipment] = useState<EquipmentRequirement[]>([]);
  const [traineeResponses, setTraineeResponses] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, AssessorConfirmation>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [courseId, traineeId]);

  const loadData = async () => {
    try {
      // Load equipment requirements
      const equipmentResponse = await fetch(`/api/courses/${courseId}/equipment`);
      let equipmentData = [];
      if (equipmentResponse.ok) {
        equipmentData = await equipmentResponse.json();
        setEquipment(equipmentData || []);
      }

      // Load trainee responses
      const responsesResponse = await fetch(`/api/courses/${courseId}/equipment/responses?trainee_id=${traineeId}`);
      if (responsesResponse.ok) {
        const responseData = await responsesResponse.json();
        const responseMap: Record<string, string> = {};
        responseData.forEach((resp: any) => {
          responseMap[resp.equipment_id] = resp.response_text || '';
        });
        setTraineeResponses(responseMap);
      }

      // Load existing confirmations
      const confirmationsResponse = await fetch(`/api/courses/${courseId}/equipment/confirmations?trainee_id=${traineeId}`);
      if (confirmationsResponse.ok) {
        const confirmationData = await confirmationsResponse.json();
        const confirmationMap: Record<string, AssessorConfirmation> = {};
        confirmationData.forEach((conf: any) => {
          confirmationMap[conf.equipment_id] = {
            equipment_id: conf.equipment_id,
            confirmed: conf.confirmed,
            assessor_notes: conf.assessor_notes
          };
        });
        setConfirmations(confirmationMap);
      }

    } catch (error) {
      console.error("Error loading equipment data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmationChange = (equipmentId: string, confirmed: boolean) => {
    setConfirmations(prev => ({
      ...prev,
      [equipmentId]: {
        equipment_id: equipmentId,
        confirmed,
        assessor_notes: prev[equipmentId]?.assessor_notes || ''
      }
    }));
  };

  const handleNotesChange = (equipmentId: string, notes: string) => {
    setConfirmations(prev => ({
      ...prev,
      [equipmentId]: {
        equipment_id: equipmentId,
        confirmed: prev[equipmentId]?.confirmed || false,
        assessor_notes: notes
      }
    }));
  };

  const saveConfirmations = async () => {
    setSaving(true);
    try {
      const confirmationList = Object.values(confirmations);
      
      for (const confirmation of confirmationList) {
        await fetch(`/api/courses/${courseId}/equipment/confirmations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trainee_id: traineeId,
            equipment_id: confirmation.equipment_id,
            confirmed: confirmation.confirmed,
            assessor_notes: confirmation.assessor_notes
          })
        });
      }

      if (onSubmit) {
        onSubmit(confirmationList);
      }
    } catch (error) {
      console.error("Error saving confirmations:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            🔍
          </div>
          <h3 className="text-lg font-semibold text-blue-900">Equipment Check</h3>
        </div>
        <p className="text-blue-700">Loading trainee equipment details...</p>
      </div>
    );
  }

  const requiredCount = equipment.filter(item => item.required).length;
  const completedCount = equipment.filter(item => item.required && confirmations[item.id]?.confirmed).length;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          🔍
        </div>
        <div>
          <h3 className="text-lg font-semibold text-blue-900">
            {blockData?.title || "Equipment Check"}
          </h3>
          <p className="text-sm text-blue-600">
            Review trainee equipment details and confirm suitability
          </p>
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-blue-400 text-4xl mb-2">📋</div>
          <p className="text-blue-700 font-medium">No Equipment to Check</p>
          <p className="text-blue-600 text-sm">No equipment has been specified for this training.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-blue-100 p-4">
            <h4 className="font-medium text-gray-900 mb-2">Assessment Progress</h4>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">Required items checked: {completedCount} / {requiredCount}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: requiredCount > 0 ? `${(completedCount / requiredCount) * 100}%` : '0%' }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            {equipment
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((item) => (
                <div key={item.id} className="bg-white rounded-md border border-blue-100 p-4">
                  <div className="space-y-4">
                    {/* Equipment Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
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
                          <p className="text-gray-600 text-sm mb-3">{item.description}</p>
                        )}
                      </div>
                      <div className="text-2xl">
                        {confirmations[item.id]?.confirmed ? "✅" : (item.required ? "❓" : "➡️")}
                      </div>
                    </div>

                    {/* Trainee Response */}
                    <div className="bg-gray-50 rounded-md p-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Trainee Response:</h5>
                      {traineeResponses[item.id] ? (
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{traineeResponses[item.id]}</p>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No response provided</p>
                      )}
                    </div>

                    {/* Assessor Confirmation */}
                    <div className="border-t pt-3">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`confirm-${item.id}`}
                            checked={confirmations[item.id]?.confirmed || false}
                            onChange={(e) => handleConfirmationChange(item.id, e.target.checked)}
                            className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                          />
                          <label htmlFor={`confirm-${item.id}`} className="text-sm font-medium text-gray-700">
                            Equipment approved for use
                          </label>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Assessor Notes (optional):
                          </label>
                          <textarea
                            value={confirmations[item.id]?.assessor_notes || ''}
                            onChange={(e) => handleNotesChange(item.id, e.target.value)}
                            placeholder="Add any notes about this equipment..."
                            className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          <div className="bg-white rounded-md border border-blue-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Ready to submit assessment?</p>
                <p className="text-sm text-gray-600">
                  {requiredCount > 0 && completedCount < requiredCount 
                    ? `Please check all required equipment items (${completedCount}/${requiredCount} completed)`
                    : "All required equipment has been assessed"
                  }
                </p>
              </div>
              <button
                onClick={saveConfirmations}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Assessment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}