"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TypeSelectionProps {
  onSelect: (type: "contractor" | "visitor") => void;
}

export default function TypeSelection({ onSelect }: TypeSelectionProps) {
  const [selected, setSelected] = useState<"contractor" | "visitor" | null>(null);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold mb-2">Welcome</h1>
        <p className="text-gray-600">Please select which best describes you</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-lg ${
            selected === "contractor" ? "ring-2 ring-blue-500 bg-blue-50" : ""
          }`}
          onClick={() => setSelected("contractor")}
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
          className={`cursor-pointer transition-all hover:shadow-lg ${
            selected === "visitor" ? "ring-2 ring-green-500 bg-green-50" : ""
          }`}
          onClick={() => setSelected("visitor")}
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
      </div>

      {selected && (
        <Button 
          className="mt-8"
          size="lg"
          onClick={() => onSelect(selected)}
        >
          Continue
        </Button>
      )}
    </div>
  );
}
