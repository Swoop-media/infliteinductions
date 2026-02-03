"use client";

import { useState } from "react";
import TypeSelection from "./TypeSelection";
import ContractorTabs from "./ContractorTabs";
import VisitorForm from "./VisitorForm";
import StaffPortal from "./StaffPortal";
import SignOutForm from "./SignOutForm";

type SelectionType = "contractor" | "visitor" | "signout" | "inflite";

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
  const [userType, setUserType] = useState<SelectionType | null>(null);

  if (!userType) {
    return <TypeSelection onSelect={setUserType} />;
  }

  const BackButton = () => (
    <button 
      onClick={() => setUserType(null)}
      className="text-gray-500 hover:text-gray-700"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );

  if (userType === "contractor") {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <BackButton />
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
            <BackButton />
            <h1 className="text-2xl font-semibold">Visitor Sign In</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Sign in as a visitor to the site.
          </p>
        </div>

        <VisitorForm 
          onBack={() => setUserType(null)}
          onSuccess={() => {
            alert("You have been signed in successfully!");
            setUserType(null);
          }}
        />
      </div>
    );
  }

  if (userType === "signout") {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="text-2xl font-semibold">Sign Out</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Sign out from the site.
          </p>
        </div>

        <SignOutForm
          onBack={() => setUserType(null)}
          onSuccess={() => {
            alert("You have been signed out successfully!");
            setUserType(null);
          }}
        />
      </div>
    );
  }

  if (userType === "inflite") {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="text-2xl font-semibold">Inflite Staff Portal</h1>
          </div>
          <p className="text-gray-600 mt-2">
            View sign-ins, sign-outs, and completed flows.
          </p>
        </div>

        <StaffPortal sites={sites} />
      </div>
    );
  }

  return null;
}
