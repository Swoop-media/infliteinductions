"use client";

interface PreQualificationCheckProps {
  onYes: () => void;
  onNo: () => void;
  onBack: () => void;
}

export default function PreQualificationCheck({ onYes, onNo, onBack }: PreQualificationCheckProps) {
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
          Have you completed a Pre-Qualification?
        </h2>
        
        <p className="text-gray-600">
          All contractors must complete pre-qualification before accessing the site.
        </p>

        <div className="flex justify-center gap-4">
          <button
            onClick={onYes}
            className="px-8 py-4 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700 transition-colors min-w-[120px]"
          >
            Yes
          </button>
          <button
            onClick={onNo}
            className="px-8 py-4 bg-red-600 text-white rounded-lg text-lg font-medium hover:bg-red-700 transition-colors min-w-[120px]"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
