"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import TypeSelection from "./TypeSelection";
import ContractorTabs from "./ContractorTabs";
import VisitorForm from "./VisitorForm";
import VisitorCourse from "./VisitorCourse";
import ContractorCourse from "./ContractorCourse";
import StaffPortal from "./StaffPortal";
import SignOutForm from "./SignOutForm";
import PreQualificationCheck from "./PreQualificationCheck";
import PreQualForm, { type PreQualFormData } from "./PreQualForm";
import SiteSelection from "./SiteSelection";
import PreQualSentToSelection from "./PreQualSentToSelection";
import AirsideCheck from "./AirsideCheck";
import ContractorDetailsForm from "./ContractorDetailsForm";

import { supabaseBrowser } from "@/lib/supabase/client";

type SelectionType = "contractor" | "visitor" | "signout" | "inflite";
type ContractorStep = "site" | "prequalification" | "prequal_form" | "details" | "sentto" | "airside" | "course" | "training" | "success";
type VisitorStep = "form" | "course" | "success";

interface VisitorFormData {
  name: string;
  phone: string;
  email: string;
  site_id: string;
  visiting_user_id: string;
}

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
  const [contractorName, setContractorName] = useState<string>("");
  const [contractorCompany, setContractorCompany] = useState<string>("");
  const [sentToPersonId, setSentToPersonId] = useState<string | null>(null);
  const [sentToPersonName, setSentToPersonName] = useState<string | null>(null);
  const [workingAirside, setWorkingAirside] = useState<boolean | null>(null);
  const [prequalFormData, setPrequalFormData] = useState<PreQualFormData | null>(null);
  
  const [visitorStep, setVisitorStep] = useState<VisitorStep>("form");
  const [visitorFormData, setVisitorFormData] = useState<VisitorFormData | null>(null);
  const [visitorSiteName, setVisitorSiteName] = useState<string>("");

  const selectedSiteName = sites.find((s: any) => s.id === selectedSiteId)?.name || "";

  const resetFlow = () => {
    setUserType(null);
    setContractorStep("site");
    setSelectedSiteId(null);
    setContractorName("");
    setContractorCompany("");
    setSentToPersonId(null);
    setSentToPersonName(null);
    setWorkingAirside(null);
    setPrequalFormData(null);
    setVisitorStep("form");
    setVisitorFormData(null);
    setVisitorSiteName("");
  };

  const createPrequalSubmissionAndNotify = async (personId: string, personName: string) => {
    try {
      const createRes = await fetch("/api/contractor-prequal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractorName: contractorName,
          contractorCompany: contractorCompany || null,
          siteId: selectedSiteId,
          sentToUserId: personId,
          prequalFormData: prequalFormData || null,
        }),
      });

      let submissionId = null;
      if (createRes.ok) {
        const createData = await createRes.json();
        submissionId = createData.submissionId;
      } else {
        console.error("Failed to create prequal submission");
        alert("There was an issue recording your pre-qualification. Staff have still been notified.");
      }

      await fetch("/api/notify/contractor-arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: personId,
          contractorName: contractorName,
          companyName: contractorCompany || null,
          siteName: selectedSiteName,
          submissionId: submissionId,
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
          onYes={() => setContractorStep("details")}
          onNo={() => setContractorStep("prequal_form")}
          onBack={() => setContractorStep("site")}
        />
      );
    }

    if (contractorStep === "prequal_form") {
      return (
        <PreQualForm
          onComplete={(data) => {
            setPrequalFormData(data);
            setContractorName(data.contractorSignName);
            setContractorCompany(data.companyName);
            setContractorStep("sentto");
          }}
          onBack={() => setContractorStep("prequalification")}
        />
      );
    }

    if (contractorStep === "details") {
      return (
        <ContractorDetailsForm
          onSubmit={(name, company) => {
            setContractorName(name);
            setContractorCompany(company);
            setContractorStep("sentto");
          }}
          onBack={() => setContractorStep("prequalification")}
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
            createPrequalSubmissionAndNotify(personId, personName);
            setContractorStep("airside");
          }}
          onBack={() => setContractorStep("details")}
        />
      );
    }

    if (contractorStep === "airside") {
      return (
        <AirsideCheck
          onYes={() => {
            setWorkingAirside(true);
            setContractorStep("course");
          }}
          onNo={() => {
            setWorkingAirside(false);
            setContractorStep("course");
          }}
          onBack={() => setContractorStep("sentto")}
        />
      );
    }

    if (contractorStep === "course" && selectedSiteId && workingAirside !== null) {
      return (
        <div className="space-y-6">
          <div className="border-b pb-4">
            <div className="flex items-center gap-2">
              <BackButton />
              <h1 className="text-2xl font-semibold">Contractor Induction</h1>
            </div>
            <p className="text-gray-600 mt-2">
              Please complete the induction before signing in.
            </p>
          </div>

          <ContractorCourse
            siteId={selectedSiteId}
            siteName={selectedSiteName}
            contractorName={contractorName}
            contractorCompany={contractorCompany}
            workingAirside={workingAirside}
            responsibleUserId={sentToPersonId}
            onBack={() => setContractorStep("airside")}
            onComplete={() => setContractorStep("success")}
          />
        </div>
      );
    }

    if (contractorStep === "success") {
      return (
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h1 className="text-2xl font-semibold text-green-700">Sign In Complete</h1>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-semibold text-green-800">
              Welcome, {contractorName}!
            </h2>
            <p className="text-green-700">
              You have successfully completed your induction and signed in at {selectedSiteName}.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
              <p className="text-amber-800 font-medium">
                Please wait for someone to escort you to the job site.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <Button onClick={resetFlow} className="bg-blue-600 hover:bg-blue-700">
              Done
            </Button>
          </div>
        </div>
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
    if (visitorStep === "form") {
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
            onProceed={(data, siteName) => {
              setVisitorFormData(data);
              setVisitorSiteName(siteName);
              setVisitorStep("course");
            }}
          />
        </div>
      );
    }

    if (visitorStep === "course" && visitorFormData) {
      return (
        <div className="space-y-6">
          <div className="border-b pb-4">
            <div className="flex items-center gap-2">
              <BackButton />
              <h1 className="text-2xl font-semibold">Visitor Induction</h1>
            </div>
            <p className="text-gray-600 mt-2">
              Please complete the induction before signing in.
            </p>
          </div>

          <VisitorCourse
            formData={visitorFormData}
            siteName={visitorSiteName}
            onBack={() => setVisitorStep("form")}
            onComplete={() => {
              setVisitorStep("success");
            }}
          />
        </div>
      );
    }

    if (visitorStep === "success") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="bg-green-100 rounded-full p-6 mb-6">
            <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-green-700 mb-4">
            You have been signed in successfully!
          </h1>
          
          <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 max-w-md mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xl font-bold text-amber-800">Important Reminder</span>
            </div>
            <p className="text-lg text-amber-900 font-semibold">
              Please remember to sign out when you leave by visiting the iPad and selecting "Sign Ins / Out"
            </p>
          </div>

          <button
            onClick={resetFlow}
            className="bg-gray-800 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      );
    }
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
