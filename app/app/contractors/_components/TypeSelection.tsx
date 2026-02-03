"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SelectionType = "contractor" | "visitor" | "signout" | "inflite";

interface TypeSelectionProps {
  onSelect: (type: SelectionType) => void;
}

export default function TypeSelection({ onSelect }: TypeSelectionProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold mb-2">Welcome</h1>
        <p className="text-gray-600">Please select an option</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-blue-500 hover:bg-blue-50"
          onClick={() => onSelect("contractor")}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <CardTitle className="text-xl">Contractor</CardTitle>
            <CardDescription className="text-base">
              Performing work on site
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-green-500 hover:bg-green-50"
          onClick={() => onSelect("visitor")}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <CardTitle className="text-xl">Visitor</CardTitle>
            <CardDescription className="text-base">
              Visiting a person
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-orange-500 hover:bg-orange-50"
          onClick={() => onSelect("signout")}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <CardTitle className="text-xl">Sign out</CardTitle>
            <CardDescription className="text-base">
              Sign out from site
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-6 max-w-4xl w-full flex justify-center">
        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-purple-500 hover:bg-purple-50 w-full md:w-1/3"
          onClick={() => onSelect("inflite")}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <CardTitle className="text-xl">Inflite</CardTitle>
            <CardDescription className="text-base">
              Staff portal
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
