"use client";

import { useState } from "react";
import TypeSelection from "./TypeSelection";
import ContractorTabs from "./ContractorTabs";

interface ContractorVisitorFlowProps {
  courses: any[];
  sites: any[];
  completions: any[];
  initialTab: string;
}

export default function ContractorVisitorFlow({ 
  courses, 
  sites, 
  completions, 
  initialTab 
}: ContractorVisitorFlowProps) {
  const [userType, setUserType] = useState<"contractor" | "visitor" | null>(null);

  if (!userType) {
    return <TypeSelection onSelect={setUserType} />;
  }

  if (userType === "contractor") {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setUserType(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold">Contractor Training</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Training courses for external contractors and subcontractors.
          </p>
        </div>

        <ContractorTabs 
          courses={courses} 
          sites={sites} 
          completions={completions}
          initialTab={initialTab}
        />
      </div>
    );
  }

  if (userType === "visitor") {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setUserType(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold">Visitor Sign In</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Sign in as a visitor to the site.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">Visitor flow coming soon...</p>
        </div>
      </div>
    );
  }

  return null;
}
