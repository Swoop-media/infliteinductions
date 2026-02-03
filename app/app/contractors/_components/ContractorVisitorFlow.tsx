"use client";

import { useState } from "react";
import TypeSelection from "./TypeSelection";
import ContractorTabs from "./ContractorTabs";
import VisitorForm from "./VisitorForm";
import StaffPortal from "./StaffPortal";
import SignOutForm from "./SignOutForm";
import PreQualificationCheck from "./PreQualificationCheck";
import SiteSelection from "./SiteSelection";
import PreQualSentToSelection from "./PreQualSentToSelection";
import AirsideCheck from "./AirsideCheck";

type SelectionType = "contractor" | "visitor" | "signout" | "inflite";
type ContractorStep = "site" | "prequalification" | "sentto" | "airside" | "training";

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
  const [contractorStep, setContractorStep] = useState<ContractorStep>("site");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sentToPersonId, setSentToPersonId] = useState<string | null>(null);
  const [sentToPersonName, setSentToPersonName] = useState<string | null>(null);
  const [workingAirside, setWorkingAirside] = useState<boolean | null>(null);

  const selectedSiteName = sites.find((s: any) => s.id === selectedSiteId)?.name || "";

  const resetFlow = () => {
    setUserType(null);
    setContractorStep("site");
    setSelectedSiteId(null);
    setSentToPersonId(null);
    setSentToPersonName(null);
    setWorkingAirside(null);
  };

  const notifyStaffOfArrival = async (personId: string, personName: string) => {
    try {
      await fetch("/api/notify/contractor-arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: personId,
          contractorName: "Contractor",
          siteName: selectedSiteName,
        }),
      });
    } catch (err) {
      console.error("Failed to notify staff:", err);
    }
  };

  if (!userType) {
    return <TypeSelection onSelect={setUserType} />;
  }

  const BackButton = () => (
    <button 
      onClick={resetFlow}
      className="text-gray-500 hover:text-gray-700"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );

  if (userType === "contractor") {
    if (contractorStep === "site") {
      return (
        <SiteSelection
          sites={sites}
          onSelect={(siteId) => {
            setSelectedSiteId(siteId);
            setContractorStep("prequalification");
          }}
          onBack={resetFlow}
        />
      );
    }

    if (contractorStep === "prequalification") {
      return (
        <PreQualificationCheck
          onYes={() => setContractorStep("sentto")}
          onNo={() => {
            alert("Please complete your pre-qualification before proceeding.");
            resetFlow();
          }}
          onBack={() => setContractorStep("site")}
        />
      );
    }

    if (contractorStep === "sentto" && selectedSiteId) {
      return (
        <PreQualSentToSelection
          siteId={selectedSiteId}
          onSelect={(personId, personName) => {
            setSentToPersonId(personId);
            setSentToPersonName(personName);
            notifyStaffOfArrival(personId, personName);
            setContractorStep("airside");
          }}
          onBack={() => setContractorStep("prequalification")}
        />
      );
    }

    if (contractorStep === "airside") {
      return (
        <AirsideCheck
          onYes={() => {
            setWorkingAirside(true);
            setContractorStep("training");
          }}
          onNo={() => {
            setWorkingAirside(false);
            setContractorStep("training");
          }}
          onBack={() => setContractorStep("sentto")}
        />
      );
    }

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
