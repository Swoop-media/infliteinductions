"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Person {
  id: string;
  full_name: string;
}

interface PreQualSentToSelectionProps {
  siteId: string;
  onSelect: (personId: string, personName: string) => void;
  onBack: () => void;
}

export default function PreQualSentToSelection({ siteId, onSelect, onBack }: PreQualSentToSelectionProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchPeople = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name")
          .is("archived_at", null)
          .eq("site_id", siteId)
          .order("full_name", { ascending: true });

        if (error) throw error;
        setPeople(data || []);
      } catch (err) {
        console.error("Error fetching people:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPeople();
  }, [siteId]);

  const filteredPeople = people.filter(person =>
    person.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedPersonName = people.find(p => p.id === selectedPerson)?.full_name || "";

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

      <div className="max-w-xl mx-auto text-center space-y-6 py-8">
        <h2 className="text-2xl font-semibold text-gray-800">
          Who have you sent this to?
        </h2>
        
        <p className="text-gray-600">
          Select the person you sent your pre-qualification to
        </p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md mx-auto p-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="w-full max-w-md mx-auto p-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a person...</option>
              {filteredPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => selectedPerson && onSelect(selectedPerson, selectedPersonName)}
            disabled={!selectedPerson}
            className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
