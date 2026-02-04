"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ContractorsButton() {
  return (
    <Link href="/app/contractors">
      <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
        <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.196-2.121M9 6a3 3 0 11-6 0 3 3 0 016 0zm9 6a3 3 0 11-6 0 3 3 0 016 0zm-9 6h8v-2a5 5 0 00-10 0v2z" />
        </svg>
        <span className="hidden sm:inline">Contractor/Visitor</span>
      </Button>
    </Link>
  );
}