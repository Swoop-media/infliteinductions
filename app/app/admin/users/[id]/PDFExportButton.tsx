
'use client';

export function PDFExportButton({ userId, userName }: { userId: string; userName: string }) {
  const handlePDFExport = () => {
    // Open a new window with the PDF view
    const pdfUrl = `/app/admin/users/${userId}/pdf`;
    window.open(pdfUrl, '_blank');
  };

  return (
    <button
      onClick={handlePDFExport}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
    >
      Export Training Record (PDF)
    </button>
  );
}
