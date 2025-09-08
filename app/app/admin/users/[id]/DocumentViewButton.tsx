
'use client';

interface DocumentViewButtonProps {
  filePath: string;
  title: string;
}

export function DocumentViewButton({ filePath, title }: DocumentViewButtonProps) {
  const handleView = async () => {
    try {
      // Create a signed URL for the document
      const response = await fetch('/api/admin/document-view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });
      
      if (response.ok) {
        const { signedUrl } = await response.json();
        window.open(signedUrl, '_blank');
      } else {
        alert('Failed to access document');
      }
    } catch (error) {
      console.error('Error viewing document:', error);
      alert('Failed to access document');
    }
  };

  return (
    <button
      onClick={handleView}
      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
    >
      View
    </button>
  );
}
