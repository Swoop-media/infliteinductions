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
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

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

  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person);
    setSearchQuery(person.full_name);
    setShowDropdown(false);
  };

  const displayPeople = searchQuery.length >= 2 ? searchResults : sitePeople;

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
          <div className="relative max-w-md mx-auto">
            <input
              type="text"
              placeholder="Type to search for a person..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedPerson(null);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full p-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            {selectedPerson && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                Selected: {selectedPerson.full_name}
                {selectedPerson.site_name ? ` (${selectedPerson.site_name})` : ""}
              </div>
            )}

            {showDropdown && !selectedPerson && (searchQuery.length >= 2 || sitePeople.length > 0) && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {loading || isSearching ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
                ) : searchQuery.length >= 2 ? (
                  searchResults.length > 0 ? (
                    <>
                      <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">Search results</div>
                      {searchResults.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                          onClick={() => handleSelectPerson(person)}
                        >
                          {person.full_name}{person.site_name ? ` (${person.site_name})` : ""}
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
                  )
                ) : sitePeople.length > 0 ? (
                  <>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">People at this site</div>
                    {sitePeople.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                        onClick={() => handleSelectPerson(person)}
                      >
                        {person.full_name}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500">No people at this site. Start typing to search all staff.</div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => selectedPerson && onSelect(selectedPerson.id, selectedPerson.full_name)}
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
