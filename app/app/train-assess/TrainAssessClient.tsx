'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface PendingItem {
  id: string;
  trainee_name: string;
  trainee_email: string;
  course_title: string;
  course_id: string;
  assignment_id: string;
  created_at: string;
  type: 'training' | 'assessment';
}

interface TrainAssessClientProps {
  initialTrainingItems: PendingItem[];
  initialAssessmentItems: PendingItem[];
}

export default function TrainAssessClient({ 
  initialTrainingItems, 
  initialAssessmentItems 
}: TrainAssessClientProps) {
  const [activeTab, setActiveTab] = useState<'training' | 'assessment'>('training');
  
  const currentItems = activeTab === 'training' ? initialTrainingItems : initialAssessmentItems;
  const itemCount = {
    training: initialTrainingItems.length,
    assessment: initialAssessmentItems.length
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Training & Assessment</h1>
      <p className="text-gray-600 mb-8">Manage onsite training and assessments for your assigned courses.</p>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('training')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'training'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <span>Pending Onsite Training</span>
              {itemCount.training > 0 && (
                <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {itemCount.training}
                </span>
              )}
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('assessment')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'assessment'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <span>Pending Onsite Assessment</span>
              {itemCount.assessment > 0 && (
                <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {itemCount.assessment}
                </span>
              )}
            </div>
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {currentItems.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
              No pending onsite {activeTab === 'training' ? 'training' : 'assessment'} sessions.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              {activeTab === 'training' 
                ? 'Trainees who have completed digital modules and are ready for onsite training.'
                : 'Trainees who have completed onsite training and are ready for assessment.'}
            </p>
            
            <div className="space-y-2">
              {currentItems.map((item) => (
                <div key={item.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">👤</span>
                          <span className="font-medium">{item.trainee_name}</span>
                          <span className="text-gray-500 text-sm">({item.trainee_email})</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">📚</span>
                          <span className="text-sm text-gray-600">{item.course_title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">📅</span>
                          <span className="text-sm text-gray-500">
                            Ready since {formatDate(item.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Link 
                        href={`/app/train-assess/course/${item.course_id}?trainee=${item.assignment_id}&type=${item.type}`}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        <span>Start {activeTab === 'training' ? 'Training' : 'Assessment'}</span>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}