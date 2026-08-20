"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ContractorModuleRenderer from "./ContractorModuleRenderer";

interface Course {
  id: string;
  title: string;
  description?: string;
  [key: string]: any;
}

interface Module {
  id: string;
  course_id: string;
  type: string;
  title: string;
  order_index: number;
  [key: string]: any;
}

interface Registration {
  id: string;
  contractor_name: string;
  contractor_email: string;
  progress_data: any;
  completed_at?: string;
  sites: { name: string };
  [key: string]: any;
}

interface ContractorCoursePlayerProps {
  course: Course;
  modules: Module[];
  registration: Registration;
}

export default function ContractorCoursePlayer({
  course,
  modules,
  registration,
}: ContractorCoursePlayerProps) {
  const router = useRouter();
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());
  const [isCompleting, setIsCompleting] = useState(false);

  // Initialize progress from registration data
  useEffect(() => {
    if (registration.progress_data && registration.progress_data.completed_modules) {
      setCompletedModules(new Set(registration.progress_data.completed_modules));
    }
  }, [registration.progress_data]);

  // Check if already completed
  if (registration.completed_at) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Course Completed!
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>You have already completed this training course.</p>
                <p className="mt-1">Completed on: {new Date(registration.completed_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentModule = modules[currentModuleIndex];
  const isLastModule = currentModuleIndex === modules.length - 1;
  const allModulesCompleted = modules.every(module => completedModules.has(module.id));

  const handleModuleComplete = async () => {
    if (!currentModule) return;

    const newCompletedModules = new Set(completedModules);
    newCompletedModules.add(currentModule.id);
    setCompletedModules(newCompletedModules);

    // Save progress
    try {
      await fetch(`/api/contractors/${registration.id}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          completed_modules: Array.from(newCompletedModules),
        }),
      });
    } catch (error) {
      console.error("Failed to save progress:", error);
    }

    // Check if course is now complete
    if (newCompletedModules.size === modules.length) {
      await handleCourseComplete();
    } else if (!isLastModule) {
      setCurrentModuleIndex(currentModuleIndex + 1);
    }
  };

  const handleCourseComplete = async () => {
    setIsCompleting(true);
    
    try {
      const response = await fetch(`/api/contractors/${registration.id}/complete`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          final_score: 100, // Default score for now
        }),
      });

      if (response.ok) {
        router.push("/app/contractors?tab=completed");
      } else {
        throw new Error("Failed to complete course");
      }
    } catch (error) {
      console.error("Failed to complete course:", error);
      setIsCompleting(false);
    }
  };

  const handlePrevModule = () => {
    if (currentModuleIndex > 0) {
      setCurrentModuleIndex(currentModuleIndex - 1);
    }
  };

  const handleNextModule = () => {
    if (currentModuleIndex < modules.length - 1) {
      setCurrentModuleIndex(currentModuleIndex + 1);
    }
  };

  if (!currentModule) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">No modules available for this course.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{completedModules.size} of {modules.length} modules completed</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedModules.size / modules.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Module Navigation */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {modules.map((module, index) => (
            <button
              key={module.id}
              onClick={() => setCurrentModuleIndex(index)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                index === currentModuleIndex
                  ? "bg-blue-100 text-blue-800"
                  : completedModules.has(module.id)
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {completedModules.has(module.id) && "✓ "}
              Module {index + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Module Content */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Module {currentModuleIndex + 1}: {currentModule.title}
        </h2>
        
        <div className="prose max-w-none">
          {currentModule.description && (
            <p className="text-gray-600 mb-4">{currentModule.description}</p>
          )}
          
          <ContractorModuleRenderer
            module={currentModule}
            registrationId={registration.id}
            onComplete={handleModuleComplete}
            isCompleted={completedModules.has(currentModule.id)}
          />
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex justify-between items-center">
        <button
          onClick={handlePrevModule}
          disabled={currentModuleIndex === 0}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous Module
        </button>

        <div className="flex gap-3">
          {allModulesCompleted ? (
            <button
              onClick={handleCourseComplete}
              disabled={isCompleting}
              className="px-6 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isCompleting ? "Finishing..." : "Finish Course"}
            </button>
          ) : (
            <button
              onClick={handleNextModule}
              disabled={isLastModule || !completedModules.has(currentModule.id)}
              className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next Module
            </button>
          )}
        </div>
      </div>
    </div>
  );
}