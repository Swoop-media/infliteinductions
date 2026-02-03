"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Person {
  id: string;
  full_name: string;
  site_id: string | null;
  site_name?: string | null;
}

interface PreQualSentToSelectionProps {
  siteId: string;
  onSelect: (personId: string, personName: string) => void;
  onBack: () => void;
}

export default function PreQualSentToSelection({ siteId, onSelect, onBack }: PreQualSentToSelectionProps) {
  const [sitePeople, setSitePeople] = useState<Person[]>([]);
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchSitePeople = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, site_id")
          .is("archived_at", null)
          .eq("site_id", siteId)
          .order("full_name", { ascending: true });

        if (error) throw error;
        setSitePeople(data || []);
      } catch (err) {
        console.error("Error fetching people:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSitePeople();
  }, [siteId]);

  useEffect(() => {
    const searchPeople = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data: sitesData } = await supabaseBrowser
          .from("sites" as any)
          .select("id, name");
        const siteMap = new Map((sitesData || []).map((s: any) => [s.id, s.name]));

        const { data, error } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, site_id")
          .is("archived_at", null)
          .ilike("full_name", `%${searchQuery}%`)
          .order("full_name", { ascending: true })
          .limit(50);

        if (error) throw error;

        const formattedData = (data || []).map((p: any) => ({
          ...p,
          site_name: p.site_id ? siteMap.get(p.site_id) || null : null,
        }));

        setSearchResults(formattedData);
      } catch (err) {
        console.error("Error searching people:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchPeople, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const displayPeople = searchQuery.length >= 2 ? searchResults : sitePeople;
  const selectedPersonData = [...sitePeople, ...searchResults].find(p => p.id === selectedPerson);
  const selectedPersonName = selectedPersonData?.full_name || "";

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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedPerson("");
            }}
            className="w-full max-w-md mx-auto p-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {searchQuery.length >= 2 && (
            <p className="text-sm text-gray-500">
              Searching all staff members...
            </p>
          )}

          {loading || isSearching ? (
            <p className="text-gray-500">Loading...</p>
          ) : (
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="w-full max-w-md mx-auto p-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a person...</option>
              {displayPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}{person.site_name ? ` (${person.site_name})` : ""}
                </option>
              ))}
            </select>
          )}

          {displayPeople.length === 0 && !loading && !isSearching && (
            <p className="text-gray-500 text-sm">
              {searchQuery.length >= 2 
                ? "No results found. Try a different search." 
                : "No staff members at this site. Use search to find someone."}
            </p>
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
