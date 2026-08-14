"use client";

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Check, X, Save, Edit2, CheckCircle } from 'lucide-react';

interface EquipmentItem {
  id: string;
  equipment_id: string;
  response_text: string;
  response_date: string;
  updated_at?: string;
  assessor_edited?: boolean;
}

interface EquipmentAssessmentViewProps {
  courseId: string;
  moduleId: string;
  traineeId: string;
  canEdit: boolean;
  moduleCompleted?: boolean;
  onApprove?: () => void;
  onComplete?: () => void;
}

export default function EquipmentAssessmentView({ 
  courseId, 
  moduleId,
  traineeId, 
  canEdit,
  moduleCompleted = false,
  onApprove,
  onComplete 
}: EquipmentAssessmentViewProps) {
  const [equipmentResponses, setEquipmentResponses] = useState<EquipmentItem[]>([]);
  const [equipmentInfo, setEquipmentInfo] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [assessmentStatus, setAssessmentStatus] = useState<'approved' | 'pending' | null>(null);
  const [traineeInfo, setTraineeInfo] = useState<{ full_name: string; email: string } | null>(null);

  useEffect(() => {
    fetchEquipmentInfo();
    fetchEquipmentResponses();
    fetchTraineeInfo();
    fetchAssessmentStatus();
  }, [courseId, traineeId, moduleId]);

  async function fetchEquipmentInfo() {
    try {
      const response = await fetch(`/api/courses/${courseId}/equipment`);
      if (response.ok) {
        const data = await response.json();
        const infoMap: Record<string, any> = {};
        data.forEach((item: any) => {
          infoMap[item.id] = item;
        });
        setEquipmentInfo(infoMap);
      }
    } catch (err) {
      console.error('Error fetching equipment info:', err);
    }
  }

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
      // Check if there's an assessment for this course and trainee
      const { data, error } = await (supabaseBrowser as any)
        .from('equipment_assessments')
        .select('status, assessed_at, assessor_id')
        .eq('course_id', courseId)
        .eq('trainee_id', traineeId)
        .maybeSingle();
      
      if (!error && data) {
        setAssessmentStatus(data.status === 'approved' ? 'approved' : 'pending');
      }
    } catch (err) {
      console.error('Error fetching assessment status:', err);
    }
  }

  async function fetchEquipmentResponses() {
    try {
      // Fetch the latest responses for this trainee
      const { data, error } = await supabaseBrowser
        .from('trainee_equipment_responses')
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
      response_text: item.response_text || ''
    });
  }

  async function handleSave(item: EquipmentItem) {
    setSaving(true);
    try {
      // Update the existing response with assessor's edits
      const { error } = await (supabaseBrowser as any)
        .from('trainee_equipment_responses')
        .upsert({
          course_id: courseId,
          user_id: traineeId,
          equipment_id: item.equipment_id,
          response_text: editValues.response_text,
          assessor_edited: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'course_id,user_id,equipment_id'
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

      // Upsert assessment record (insert or update if exists)
      const { data, error } = await (supabaseBrowser as any)
        .from('equipment_assessments')
        .upsert({
          course_id: courseId,
          trainee_id: traineeId,
          assessor_id: user.id,
          status: 'approved',
          assessed_at: new Date().toISOString()
        }, {
          onConflict: 'course_id,trainee_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error approving assessment:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        alert(`Failed to approve assessment: ${error.message || 'Unknown error'}`);
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
                  <div>
                    <h3 className="font-semibold text-lg mb-2">
                      {equipmentInfo[item.equipment_id]?.equipment_name || item.equipment_id}
                    </h3>
                    {equipmentInfo[item.equipment_id]?.description && (
                      <p className="text-sm text-gray-600 mb-4">
                        {equipmentInfo[item.equipment_id].description}
                      </p>
                    )}
                    <label className="block text-sm font-medium mb-1">Equipment Details</label>
                    <textarea
                      value={editValues.response_text}
                      onChange={(e) => setEditValues({...editValues, response_text: e.target.value})}
                      className="w-full px-3 py-2 border rounded-md min-h-[100px]"
                      placeholder="Enter equipment details..."
                    />
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
                      onClick={() => handleSave(item)}
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
                    <div>
                      <h3 className="font-semibold text-lg">
                        {equipmentInfo[item.equipment_id]?.equipment_name || item.equipment_id}
                      </h3>
                      {equipmentInfo[item.equipment_id]?.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {equipmentInfo[item.equipment_id].description}
                        </p>
                      )}
                    </div>
                    {canEdit && assessmentStatus !== 'approved' && (
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded-md"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Trainee Response:</p>
                    <p className="text-gray-900 whitespace-pre-wrap">
                      {item.response_text || <span className="text-gray-400 italic">No response provided</span>}
                    </p>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <div>Submitted: {new Date(item.response_date).toLocaleDateString()}</div>
                    {item.assessor_edited && (
                      <div className="text-blue-600 font-medium">✓ Edited by Assessor</div>
                    )}
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
      
      {/* Complete Module Button - shows after equipment is approved */}
      {assessmentStatus === 'approved' && onComplete && canEdit && !moduleCompleted && (
        <div className="bg-white rounded-lg border p-6 mt-4">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Equipment assessment has been approved. Click below to mark this assessment module as complete.
            </p>
            <button 
              onClick={onComplete} 
              className="w-full px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center font-medium"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Complete Assessment Module
            </button>
          </div>
        </div>
      )}
    </div>
  );
}