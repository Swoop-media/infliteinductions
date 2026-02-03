"use client";

import { useState } from "react";

interface Site {
  id: string;
  name: string;
}

interface SiteSelectionProps {
  sites: Site[];
  onSelect: (siteId: string) => void;
  onBack: () => void;
}

export default function SiteSelection({ sites, onSelect, onBack }: SiteSelectionProps) {
  const [selectedSite, setSelectedSite] = useState<string>("");

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

      <div className="max-w-xl mx-auto text-center space-y-8 py-8">
        <h2 className="text-2xl font-semibold text-gray-800">
          What site are you at?
        </h2>
        
        <div className="space-y-4">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full max-w-md mx-auto p-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a site...</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => selectedSite && onSelect(selectedSite)}
            disabled={!selectedSite}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
