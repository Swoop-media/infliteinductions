"use client";

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Check, X, Save, Edit2, CheckCircle } from 'lucide-react';

interface EquipmentItem {
  id: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  color?: string | null;
  size?: string | null;
  container_brand?: string | null;
  container_model?: string | null;
  container_serial?: string | null;
  container_size?: string | null;
  response_date: string;
}

interface EquipmentAssessmentViewProps {
  courseId: string;
  moduleId: string;
  traineeId: string;
  canEdit: boolean;
  onApprove?: () => void;
}

export default function EquipmentAssessmentView({ 
  courseId, 
  moduleId,
  traineeId, 
  canEdit,
  onApprove 
}: EquipmentAssessmentViewProps) {
  const [equipmentResponses, setEquipmentResponses] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<'approved' | 'pending' | null>(null);
  const [traineeInfo, setTraineeInfo] = useState<{ full_name: string; email: string } | null>(null);

  useEffect(() => {
    fetchEquipmentResponses();
    fetchTraineeInfo();
    fetchAssessmentStatus();
  }, [courseId, traineeId, moduleId]);

  async function fetchTraineeInfo() {
    try {
      const { data, error } = await supabaseBrowser
        .from('profiles')
        .select('full_name, email')
        .eq('id', traineeId)
        .single();
      
      if (!error && data) {
        setTraineeInfo(data);
      }
    } catch (err) {
      console.error('Error fetching trainee info:', err);
    }
  }

  async function fetchAssessmentStatus() {
    try {
      // Check if there's an assessment for this module
      const { data, error } = await supabaseBrowser
        .from('equipment_assessments')
        .select('assessment_result, assessed_at, assessor_id')
        .eq('module_id', moduleId)
        .maybeSingle();
      
      if (!error && data) {
        setAssessmentStatus(data.assessment_result === 'pass' ? 'approved' : 'pending');
      }
    } catch (err) {
      console.error('Error fetching assessment status:', err);
    }
  }

  async function fetchEquipmentResponses() {
    try {
      // Fetch the latest responses for this trainee
      const { data, error } = await supabaseBrowser
        .from('equipment_responses')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', traineeId)
        .order('response_date', { ascending: false });

      if (error) {
        console.error('Error fetching equipment responses:', error);
      } else {
        // Group by equipment_id and take the latest response for each
        const latestResponses = data?.reduce((acc: any, response: any) => {
          if (!acc[response.equipment_id] || 
              new Date(response.response_date) > new Date(acc[response.equipment_id].response_date)) {
            acc[response.equipment_id] = response;
          }
          return acc;
        }, {});

        setEquipmentResponses(Object.values(latestResponses || {}));
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEdit(item: EquipmentItem) {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      brand: item.brand || '',
      model: item.model || '',
      serial: item.serial || '',
      color: item.color || '',
      size: item.size || '',
      container_brand: item.container_brand || '',
      container_model: item.container_model || '',
      container_serial: item.container_serial || '',
      container_size: item.container_size || ''
    });
  }

  async function handleSave(itemId: string) {
    setSaving(true);
    try {
      // Create a new response with assessor's edits
      const { error } = await supabaseBrowser
        .from('equipment_responses')
        .insert({
          course_id: courseId,
          user_id: traineeId,
          equipment_id: itemId,
          ...editValues,
          assessor_edited: true
        });

      if (error) {
        console.error('Error saving equipment edit:', error);
        alert('Failed to save changes');
      } else {
        setEditingId(null);
        await fetchEquipmentResponses();
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!canEdit) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) return;

      // Create assessment record with the existing table structure
      // Since we don't have equipment_submission_id, we'll create a simplified record
      const { error } = await supabaseBrowser
        .from('equipment_assessments')
        .insert({
          id: crypto.randomUUID(),
          equipment_submission_id: crypto.randomUUID(), // Generate a placeholder ID since this field is required
          module_id: moduleId,
          assessor_id: user.id,
          assessment_result: 'pass',
          assessment_details: {
            course_id: courseId,
            trainee_id: traineeId,
            equipment_count: equipmentResponses.length,
            approved: true
          },
          assessed_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error approving assessment:', error);
        alert('Failed to approve assessment');
      } else {
        setAssessmentStatus('approved');
        if (onApprove) onApprove();
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to approve assessment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg border">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-xl font-bold mb-2">Equipment Assessment Review</h2>
        {traineeInfo && (
          <p className="text-gray-600 mb-4">
            Trainee: <span className="font-medium">{traineeInfo.full_name}</span> ({traineeInfo.email})
          </p>
        )}
        {assessmentStatus === 'approved' && (
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 mr-1" />
            Equipment Assessment Approved
          </div>
        )}
      </div>

      {/* Equipment Responses */}
      {equipmentResponses.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600">No equipment responses submitted yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {equipmentResponses.map((item) => (
            <div key={item.id} className="bg-white rounded-lg border p-6">
              {editingId === item.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name</label>
                      <input
                        type="text"
                        value={editValues.name}
                        onChange={(e) => setEditValues({...editValues, name: e.target.value})}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Brand</label>
                      <input
                        type="text"
                        value={editValues.brand}
                        onChange={(e) => setEditValues({...editValues, brand: e.target.value})}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Model</label>
                      <input
                        type="text"
                        value={editValues.model}
                        onChange={(e) => setEditValues({...editValues, model: e.target.value})}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Serial</label>
                      <input
                        type="text"
                        value={editValues.serial}
                        onChange={(e) => setEditValues({...editValues, serial: e.target.value})}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    {editValues.container_brand !== undefined && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">Container Brand</label>
                          <input
                            type="text"
                            value={editValues.container_brand}
                            onChange={(e) => setEditValues({...editValues, container_brand: e.target.value})}
                            className="w-full px-3 py-2 border rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Container Model</label>
                          <input
                            type="text"
                            value={editValues.container_model}
                            onChange={(e) => setEditValues({...editValues, container_model: e.target.value})}
                            className="w-full px-3 py-2 border rounded-md"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSave(item.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                      disabled={saving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    {canEdit && assessmentStatus !== 'approved' && (
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded-md"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {item.brand && (
                      <div>
                        <span className="font-medium text-gray-600">Brand:</span> {item.brand}
                      </div>
                    )}
                    {item.model && (
                      <div>
                        <span className="font-medium text-gray-600">Model:</span> {item.model}
                      </div>
                    )}
                    {item.serial && (
                      <div>
                        <span className="font-medium text-gray-600">Serial:</span> {item.serial}
                      </div>
                    )}
                    {item.color && (
                      <div>
                        <span className="font-medium text-gray-600">Color:</span> {item.color}
                      </div>
                    )}
                    {item.size && (
                      <div>
                        <span className="font-medium text-gray-600">Size:</span> {item.size}
                      </div>
                    )}
                    {item.container_brand && (
                      <div>
                        <span className="font-medium text-gray-600">Container Brand:</span> {item.container_brand}
                      </div>
                    )}
                    {item.container_model && (
                      <div>
                        <span className="font-medium text-gray-600">Container Model:</span> {item.container_model}
                      </div>
                    )}
                    {item.container_serial && (
                      <div>
                        <span className="font-medium text-gray-600">Container Serial:</span> {item.container_serial}
                      </div>
                    )}
                    {item.container_size && (
                      <div>
                        <span className="font-medium text-gray-600">Container Size:</span> {item.container_size}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 text-xs text-gray-500">
                    Submitted: {new Date(item.response_date).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approval Button */}
      {canEdit && assessmentStatus !== 'approved' && equipmentResponses.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleApprove}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center font-medium"
            disabled={saving}
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            {saving ? 'Processing...' : 'Approve Equipment Assessment'}
          </button>
        </div>
      )}
    </div>
  );
}