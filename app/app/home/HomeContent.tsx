'use client';

import Link from 'next/link';

interface HomeContentProps {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  notice?: string;
  banner?: string;
}

export default function HomeContent({ profile, notice, banner }: HomeContentProps) {
  return (
    <div className="space-y-8">
      {/* Status messages */}
      {notice === "revoked" && (
        <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            ✓ User assignment revoked
          </div>
        </div>
      )}

      {banner === "no_access" && (
        <div className="mb-4 rounded-md bg-red-50 p-4 border border-red-200">
          <div className="text-sm text-red-800">
            ⚠️ Sorry, you do not have access to that page. Please contact your administrator if you believe this is an error.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          {profile?.email && <p className="text-sm text-gray-600">{profile.email}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/app/myprofile" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            My profile
          </Link>
        </div>
      </div>

      {/* Getting Started Section */}
      <div className="rounded-xl border bg-blue-50 p-6 mb-6">
        <p className="text-xl font-bold text-gray-900">
          To begin go to My Profile - then click continue on an authorisation
        </p>
      </div>

      {/* Handy Information Section */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">📌 Handy Information</h2>
        
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold">
                1
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Video Playback:</span> The videos in the course player may not work in all browsers. 
                Once signed in, you can play them by opening in a new tab if you experience any issues.
              </p>
              <div className="mt-3">
                <img 
                  src="/open-in-browser-guide.png" 
                  alt="Open in browser button location" 
                  className="rounded-lg border border-gray-200 shadow-sm max-w-full"
                  style={{ maxHeight: '300px' }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-1">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold">
                2
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Document Uploads:</span> Courses may ask you to upload documents. When these documents are multiple pages or front and back, 
                please use an application to make it one file, such as this free one - {" "}
                <a 
                  href="https://www.camscanner.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  CamScanner
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}