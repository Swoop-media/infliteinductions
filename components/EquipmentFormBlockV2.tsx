"use client";

import { useState, useEffect } from 'react';

interface EquipmentItem {
  id: string;
  stable_id: string;
  equipment_name: string;
  description?: string;
  category?: string;
  required: boolean;
  order_index: number;
}

interface FormInstance {
  id: string;
  kind: string;
  course_id: string;
  title: string;
  description?: string;
  requires_assessor_confirmation: boolean;
  items: EquipmentItem[];
}

interface EquipmentFormBlockV2Props {
  courseId: string;
  instanceId?: string; // Optional: specific instance to show
  userId: string;
  preview?: boolean;
  onComplete?: () => void;
}

export default function EquipmentFormBlockV2({
  courseId,
  instanceId,
  userId,
  preview = false,
  onComplete
}: EquipmentFormBlockV2Props) {
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedForms, setExpandedForms] = useState<Record<string, boolean>>({});
  const [submittedForms, setSubmittedForms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadEquipmentForms();
    if (!preview) {
      loadUserResponses();
    }
  }, [courseId, userId, preview]);

  const loadEquipmentForms = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment/v2`);
      if (response.ok) {
        const data = await response.json();
        setInstances(data.instances || []);
        
        // Initialize expanded state for each form
        const expanded: Record<string, boolean> = {};
        data.instances?.forEach((instance: FormInstance) => {
          expanded[instance.id] = !submittedForms[instance.id];
        });
        setExpandedForms(expanded);
      }
    } catch (error) {
      console.error("Error loading equipment forms:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserResponses = async () => {
    try {
      const response = await fetch(
        `/api/courses/${courseId}/equipment/v2/responses?user_id=${userId}${
          instanceId ? `&instance_id=${instanceId}` : ''
        }`
      );
      if (response.ok) {
        const data = await response.json();
        
        // Map responses to our state format
        const responseMap: Record<string, string> = {};
        Object.entries(data.responses).forEach(([key, value]: [string, any]) => {
          responseMap[key] = value.response_text || '';
        });
        setResponses(responseMap);
        
        // Check which forms are already submitted
        const submitted: Record<string, boolean> = {};
        instances.forEach(instance => {
          const requiredItems = instance.items.filter(item => item.required);
          const completedRequired = requiredItems.filter(item => {
            const key = `${instance.id}_${item.stable_id}`;
            return responseMap[key]?.trim();
          }).length;
          
          if (requiredItems.length > 0 && completedRequired === requiredItems.length) {
            submitted[instance.id] = true;
          }
        });
        setSubmittedForms(submitted);
      }
    } catch (error) {
      console.error("Error loading user responses:", error);
    }
  };

  const handleResponseChange = (instanceId: string, itemId: string, stableId: string, value: string) => {
    const key = `${instanceId}_${stableId}`;
    setResponses(prev => ({ ...prev, [key]: value }));
  };

  const saveResponse = async (instanceId: string, itemId: string) => {
    if (preview) return;
    
    const item = instances
      .find(i => i.id === instanceId)
      ?.items.find(it => it.id === itemId);
    
    if (!item) return;
    
    const key = `${instanceId}_${item.stable_id}`;
    
    setSaving(true);
    try {
      await fetch(`/api/courses/${courseId}/equipment/v2/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: instanceId,
          item_id: itemId,
          user_id: userId,
          response_text: responses[key] || ''
        })
      });
    } catch (error) {
      console.error("Error saving response:", error);
    } finally {
      setSaving(false);
    }
  };

  const submitForm = async (instance: FormInstance) => {
    if (preview) return;
    
    setSaving(true);
    try {
      // Save all responses for this form
      const savePromises = instance.items
        .filter(item => {
          const key = `${instance.id}_${item.stable_id}`;
          return responses[key]?.trim();
        })
        .map(item => 
          fetch(`/api/courses/${courseId}/equipment/v2/responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instance_id: instance.id,
              item_id: item.id,
              user_id: userId,
              response_text: responses[`${instance.id}_${item.stable_id}`] || ''
            })
          })
        );
      
      await Promise.all(savePromises);
      
      // Mark form as submitted and collapse
      setSubmittedForms(prev => ({ ...prev, [instance.id]: true }));
      setExpandedForms(prev => ({ ...prev, [instance.id]: false }));
      
      if (onComplete) onComplete();
      
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setSaving(false);
    }
  };

  const toggleFormExpansion = (instanceId: string) => {
    setExpandedForms(prev => ({ ...prev, [instanceId]: !prev[instanceId] }));
  };

  if (loading) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <div className="text-center">
          <p className="text-slate-700">Loading equipment forms...</p>
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <div className="text-center">
          <div className="text-slate-400 text-4xl mb-2">📋</div>
          <p className="text-slate-700 font-medium">No Equipment Forms</p>
          <p className="text-slate-600 text-sm">No equipment forms configured for this course.</p>
        </div>
      </div>
    );
  }

  // Filter by specific instance if provided
  const formsToShow = instanceId 
    ? instances.filter(i => i.id === instanceId)
    : instances;

  return (
    <div className="space-y-4">
      {formsToShow.map((instance) => {
        const isExpanded = expandedForms[instance.id];
        const isSubmitted = submittedForms[instance.id];
        const requiredItems = instance.items.filter(item => item.required);
        const completedRequired = requiredItems.filter(item => {
          const key = `${instance.id}_${item.stable_id}`;
          return responses[key]?.trim();
        }).length;
        const isFormComplete = requiredItems.length > 0 && completedRequired === requiredItems.length;

        // Collapsed view for submitted forms
        if (isSubmitted && !isExpanded) {
          return (
            <div key={instance.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    ✅
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">{instance.title}</h3>
                    <p className="text-sm text-green-600">
                      Equipment submitted ({completedRequired}/{requiredItems.length} required items)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleFormExpansion(instance.id)}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                >
                  Review & Update
                </button>
              </div>
            </div>
          );
        }

        // Expanded form view
        return (
          <div key={instance.id} className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                🔧
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{instance.title}</h3>
                {instance.description && (
                  <p className="text-sm text-slate-600">{instance.description}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {instance.items
                .sort((a, b) => a.order_index - b.order_index)
                .map((item) => {
                  const key = `${instance.id}_${item.stable_id}`;
                  const hasResponse = !!responses[key]?.trim();

                  return (
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
                          {hasResponse ? "✅" : (item.required ? "⏳" : "📝")}
                        </div>
                      </div>
                      
                      {!preview && (
                        <div className="space-y-2">
                          <textarea
                            value={responses[key] || ''}
                            onChange={(e) => handleResponseChange(instance.id, item.id, item.stable_id, e.target.value)}
                            onBlur={() => saveResponse(instance.id, item.id)}
                            placeholder={`Describe your ${item.equipment_name.toLowerCase()}...`}
                            className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                            disabled={saving}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {!preview && (
              <div className="bg-white rounded-md border border-slate-100 p-4 mt-4">
                {isFormComplete && !isSubmitted ? (
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-700 mb-3">
                      <div className="w-5 h-5">✅</div>
                      <p className="text-sm font-medium">Ready to Submit</p>
                    </div>
                    <p className="text-slate-600 text-sm mb-4">
                      All required items complete. Submit to finalize this equipment form.
                    </p>
                    <button
                      onClick={() => submitForm(instance)}
                      disabled={saving}
                      className="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? "Submitting..." : "Submit Equipment Form"}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <div className="w-5 h-5">ℹ️</div>
                      <p className="text-sm font-medium">Progress</p>
                    </div>
                    <p className="text-slate-600 text-sm mt-1">
                      Complete all required items to submit this form.
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Required: {completedRequired} of {requiredItems.length}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}