// @ts-nocheck

'use client';

export default function PrintButton() {
  return (
    <div className="no-print mb-6">
      <button 
        onClick={() => window.print()} 
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
