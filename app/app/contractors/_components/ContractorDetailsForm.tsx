"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ContractorDetailsFormProps {
  onSubmit: (name: string, company: string) => void;
  onBack: () => void;
}

export default function ContractorDetailsForm({ onSubmit, onBack }: ContractorDetailsFormProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), company.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-semibold">Contractor</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto text-center space-y-6 py-8">
        <h2 className="text-2xl font-semibold text-gray-800">
          Your Details
        </h2>
        
        <p className="text-gray-600">
          Please provide your name and company
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name *
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              required
              className="text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <Input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enter your company name (optional)"
              className="text-lg"
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-6 text-lg"
            >
              Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
