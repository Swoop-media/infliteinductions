"use client";

import { useState } from "react";
import Link from "next/link";
import ContractorRegistrationForm from "./ContractorRegistrationForm";

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

interface CoursesTabProps {
  courses: Course[];
  sites: Site[];
}

export default function CoursesTab({ courses, sites }: CoursesTabProps) {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const handleBeginCourse = (course: Course) => {
    setSelectedCourse(course);
  };

  const handleCloseForm = () => {
    setSelectedCourse(null);
  };

  return (
    <>
      {!courses || courses.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Contractor Courses</h3>
          <p className="text-gray-500 mb-6">
            No courses have been marked as available for external contractors yet.
          </p>
          <Link
            href="/app/creator"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="mr-2 -ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Course
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {courses.map((course: Course) => (
            <div
              key={course.id}
              className="border rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {course.title || "Untitled Course"}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Published
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Contractor Course
                    </span>
                  </div>
                  
                  {course.description && (
                    <p className="text-gray-600 mb-3 line-clamp-2">
                      {course.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {course.department && (
                      <div className="flex items-center gap-1">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span>{course.department}</span>
                      </div>
                    )}
                    
                    {course.tags && Array.isArray(course.tags) && course.tags.length > 0 && (
                      <div className="flex items-center gap-1">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <span className="truncate">{course.tags.slice(0, 3).join(", ")}{course.tags.length > 3 ? "..." : ""}</span>
                      </div>
                    )}

                    {course.valid_for_days && (
                      <div className="flex items-center gap-1">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Valid for {course.valid_for_days} days</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleBeginCourse(course)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Begin
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Registration Form Modal */}
      {selectedCourse && (
        <ContractorRegistrationForm
          course={selectedCourse}
          sites={sites}
          onClose={handleCloseForm}
        />
      )}
    </>
  );
}