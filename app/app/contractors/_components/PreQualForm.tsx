"use client";

import { useState } from "react";

interface PreQualFormProps {
  onComplete: (data: PreQualFormData) => void;
  onBack: () => void;
}

export interface PreQualFormData {
  scopeOfWork: string;
  companyName: string;
  companyRep: string;
  answers: Record<string, "yes" | "no" | "na">;
  insuranceTypes: string[];
  insuranceDetails: string;
  safetySystemDetails: string;
  contractorSignName: string;
  contractorSignPosition: string;
}

type Answer = "yes" | "no" | "na";

const SECTION_1_QUESTIONS = [
  {
    id: "1.1",
    text: "Do you operate a Health and Safety Management System aligned with recognised standards (e.g., ISO 45001, AS/NZS 4801) or an equivalent system appropriate to the scale and risk of your work?",
    required: true,
    hasDetails: true,
    detailsField: "safetySystemDetails",
  },
  {
    id: "1.2",
    text: "Do you have a Health and Safety Policy, signed and dated by Senior Management within the last 2 years?",
    required: true,
  },
  {
    id: "1.3",
    text: "Can you provide confirmation of relevant insurances?",
    required: true,
    hasInsurance: true,
  },
  {
    id: "1.4",
    text: 'Do you have documentation that references the Health and Safety at Work Act 2015 (HSWA)? e.g. manual, forms and templates',
    required: true,
  },
];

const SECTION_2_QUESTIONS = [
  {
    id: "2.1",
    text: "Do you set annual H&S safety objectives to improve your safety performance?",
  },
  {
    id: "2.2",
    text: "Do you have systems to manage hazards and risks associated with the risk profile of your workplace activities?",
  },
  {
    id: "2.3",
    text: "Do you have systems to induct and train your workers suitable to the nature of your workplace activities?",
  },
  {
    id: "2.4",
    text: "Do you have a Training/Competency Register for your workers?",
  },
  {
    id: "2.5",
    text: "Do you have documented systems for reporting and investigating accidents and incidents?",
  },
  {
    id: "2.6",
    text: "Do you have systems to respond to an emergency should one occur?",
  },
  {
    id: "2.7",
    text: "Do you have systems to manage any subcontractors you might engage to complete any works?",
  },
  {
    id: "2.8",
    text: "Are you willing to consult, cooperate, and coordinate to keep people safe?",
  },
];

const INSURANCE_OPTIONS = ["Public Liability", "Public Indemnity", "Other"];

export default function PreQualForm({ onComplete, onBack }: PreQualFormProps) {
  const [step, setStep] = useState<"details" | "section1" | "section2" | "acknowledgement">("details");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyRep, setCompanyRep] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [insuranceTypes, setInsuranceTypes] = useState<string[]>([]);
  const [insuranceDetails, setInsuranceDetails] = useState("");
  const [safetySystemDetails, setSafetySystemDetails] = useState("");
  const [contractorSignName, setContractorSignName] = useState("");
  const [contractorSignPosition, setContractorSignPosition] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const setAnswer = (id: string, value: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleInsurance = (type: string) => {
    setInsuranceTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const validateDetails = () => {
    const errs: string[] = [];
    if (!scopeOfWork.trim()) errs.push("Scope of work is required");
    if (!companyName.trim()) errs.push("Company name is required");
    if (!companyRep.trim()) errs.push("Company representative is required");
    setErrors(errs);
    return errs.length === 0;
  };

  const validateSection1 = () => {
    const errs: string[] = [];
    for (const q of SECTION_1_QUESTIONS) {
      if (!answers[q.id]) {
        errs.push(`Question ${q.id} is required`);
      }
    }
    setErrors(errs);
    return errs.length === 0;
  };

  const validateSection2 = () => {
    const errs: string[] = [];
    for (const q of SECTION_2_QUESTIONS) {
      if (!answers[q.id]) {
        errs.push(`Question ${q.id} is required`);
      }
    }
    setErrors(errs);
    return errs.length === 0;
  };

  const validateAcknowledgement = () => {
    const errs: string[] = [];
    if (!contractorSignName.trim()) errs.push("Your name is required");
    if (!contractorSignPosition.trim()) errs.push("Your position is required");
    setErrors(errs);
    return errs.length === 0;
  };

  const handleSubmit = () => {
    if (!validateAcknowledgement()) return;
    onComplete({
      scopeOfWork,
      companyName,
      companyRep,
      answers,
      insuranceTypes,
      insuranceDetails,
      safetySystemDetails,
      contractorSignName,
      contractorSignPosition,
    });
  };

  const AnswerButtons = ({ questionId }: { questionId: string }) => (
    <div className="flex gap-2 mt-2">
      {(["yes", "no", "na"] as const).map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => setAnswer(questionId, val)}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
            answers[questionId] === val
              ? val === "yes"
                ? "bg-green-600 text-white border-green-600"
                : val === "no"
                ? "bg-red-600 text-white border-red-600"
                : "bg-gray-600 text-white border-gray-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {val === "na" ? "N/A" : val.charAt(0).toUpperCase() + val.slice(1)}
        </button>
      ))}
    </div>
  );

  const stepLabels = ["Details", "Safety Management", "Performance", "Sign Off"];
  const stepKeys = ["details", "section1", "section2", "acknowledgement"];
  const currentIndex = stepKeys.indexOf(step);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-semibold">Contractor Pre-Qualification</h1>
        </div>
        <p className="text-gray-600 mt-1 text-sm">
          Complete this form before accessing the site. All fields marked with * are required.
        </p>
      </div>

      <div className="flex items-center justify-between max-w-xl mx-auto mb-6">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i < currentIndex
                    ? "bg-green-600 text-white"
                    : i === currentIndex
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < currentIndex ? "✓" : i + 1}
              </div>
              <span className="text-xs mt-1 text-gray-600 hidden sm:block">{label}</span>
            </div>
            {i < stepLabels.length - 1 && (
              <div className={`w-12 sm:w-20 h-0.5 mx-1 ${i < currentIndex ? "bg-green-600" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <ul className="text-sm text-red-700 space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {step === "details" && (
        <div className="max-w-xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">Contractor Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scope / Project / Activity *
            </label>
            <textarea
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              rows={3}
              placeholder="Describe the work to be carried out"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Represented *</label>
            <input
              type="text"
              value={companyRep}
              onChange={(e) => setCompanyRep(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => {
                if (validateDetails()) {
                  setErrors([]);
                  setStep("section1");
                }
              }}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "section1" && (
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">Section 1: Safety Management System</h2>
          <p className="text-sm text-gray-600">
            All questions in this section are mandatory. Contractors cannot be approved without satisfying these requirements.
          </p>

          {SECTION_1_QUESTIONS.map((q) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-800">
                {q.id} <span className="text-red-500">*</span> {q.text}
              </p>

              <AnswerButtons questionId={q.id} />

              {q.hasDetails && answers[q.id] === "yes" && (
                <div className="mt-3">
                  <label className="block text-sm text-gray-600 mb-1">Details:</label>
                  <input
                    type="text"
                    value={safetySystemDetails}
                    onChange={(e) => setSafetySystemDetails(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. ISO 45001 certified"
                  />
                </div>
              )}

              {q.hasInsurance && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-600">Insurance types:</p>
                  <div className="flex gap-3 flex-wrap">
                    {INSURANCE_OPTIONS.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={insuranceTypes.includes(opt)}
                          onChange={() => toggleInsurance(opt)}
                          className="rounded"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Details:</label>
                    <input
                      type="text"
                      value={insuranceDetails}
                      onChange={(e) => setInsuranceDetails(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder="Policy numbers, providers, etc."
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => { setErrors([]); setStep("details"); }}
              className="px-6 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (validateSection1()) {
                  setErrors([]);
                  setStep("section2");
                }
              }}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "section2" && (
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">Section 2: Performance</h2>

          {SECTION_2_QUESTIONS.map((q) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-800">
                {q.id} {q.text}
              </p>
              <AnswerButtons questionId={q.id} />
            </div>
          ))}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => { setErrors([]); setStep("section1"); }}
              className="px-6 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (validateSection2()) {
                  setErrors([]);
                  setStep("acknowledgement");
                }
              }}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "acknowledgement" && (
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">Acknowledgement & Sign Off</h2>

          <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 space-y-3">
            <p>By signing below, the Contractor acknowledges that:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>They understand their obligations under the Health & Safety at Work Act 2015 and confirm their intention to comply while working on this contract.</li>
              <li>Both the Principal and Contractor are PCBUs under the HSWA 2015 and will consult, cooperate, and coordinate activities to manage health and safety risks.</li>
              <li>The Contractor has a Health & Safety management system in place which ensures compliance with the HSWA 2015.</li>
              <li>The Contractor agrees to make available for inspection any documentation related to health and safety in connection with this contract.</li>
              <li>The Contractor will advise the Principal immediately of any notifiable events or accidents and meet the reporting requirements of the HSWA 2015.</li>
              <li>The Contractor will advise the Principal immediately of any new hazard created during the contract.</li>
              <li>Before beginning work, the contractor will carry out a risk assessment to identify hazards and develop controls for all high-risk items.</li>
            </ul>
            <p className="font-medium mt-4">
              Signing below acknowledges that to the best of your knowledge this information is true and correct.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
            <input
              type="text"
              value={contractorSignName}
              onChange={(e) => setContractorSignName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Position *</label>
            <input
              type="text"
              value={contractorSignPosition}
              onChange={(e) => setContractorSignPosition(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => { setErrors([]); setStep("section2"); }}
              className="px-6 py-2.5 border rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Submit Pre-Qualification
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
