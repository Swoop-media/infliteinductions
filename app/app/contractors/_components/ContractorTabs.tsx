"use client";

import { useState } from "react";
import CoursesTab from "./CoursesTab";
import CompletedTab from "./CompletedTab";

interface Course {
  id: string;
  title?: string;
  description?: string;
  department?: string;
  tags?: string[];
  valid_for_days?: number;
  [key: string]: any;
}

interface Site {
  id: string;
  name: string;
  address?: string;
  active: boolean;
  [key: string]: any;
}

interface Completion {
  id: string;
  contractor_name: string;
  contractor_email: string;
  completed_at: string;
  courses: { title: string };
  sites: { name: string };
  final_score?: number;
  [key: string]: any;
}

interface ContractorTabsProps {
  courses: Course[];
  sites: Site[];
  completions: Completion[];
  initialTab?: string;
}

export default function ContractorTabs({ courses, sites, completions, initialTab = "courses" }: ContractorTabsProps) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div>
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("courses")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "courses"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Courses
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "completed"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Completed
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "courses" && (
        <CoursesTab courses={courses} sites={sites} />
      )}
      {activeTab === "completed" && (
        <CompletedTab completions={completions} />
      )}
    </div>
  );
}