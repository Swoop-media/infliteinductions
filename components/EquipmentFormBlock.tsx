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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEquipmentRequirements();
  }, [courseId]);

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
          
          <div className="space-y-3">
            {equipment
              .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
              .map((item) => (
                <div key={item.id} className="bg-white rounded-md border border-orange-100 p-4">
                  <div className="flex items-start justify-between gap-3">
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
                        <p className="text-gray-600 text-sm">{item.description}</p>
                      )}
                    </div>
                    <div className="text-2xl">
                      {item.required ? "✅" : "➡️"}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {!preview && (
            <div className="bg-white rounded-md border border-orange-100 p-4 mt-4">
              <div className="flex items-center gap-2 text-orange-700">
                <div className="w-5 h-5">ℹ️</div>
                <p className="text-sm font-medium">Ready to proceed?</p>
              </div>
              <p className="text-orange-600 text-sm mt-1">
                Make sure you have all required equipment before continuing with the training.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}