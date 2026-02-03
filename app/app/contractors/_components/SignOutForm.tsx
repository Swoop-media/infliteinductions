"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Site {
  id: string;
  name: string;
}

interface SignedInPerson {
  id: string;
  name: string;
  type: "visitor" | "contractor";
  site_id: string | null;
  site_name?: string;
  signed_in_at: string;
  company?: string | null;
}

interface SignOutFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function SignOutForm({ onBack, onSuccess }: SignOutFormProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [signedInPeople, setSignedInPeople] = useState<SignedInPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteMap = useMemo(() => {
    return new Map(sites.map((s) => [s.id, s.name]));
  }, [sites]);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("sites" as any)
          .select("id, name")
          .eq("active", true)
          .order("name", { ascending: true });

        if (error) throw error;
        setSites(data || []);
      } catch (err) {
        console.error("Error fetching sites:", err);
      }
    };

    fetchSites();
  }, []);

  useEffect(() => {
    loadSignedInPeople();
  }, [siteMap]);

  const loadSignedInPeople = async () => {
    setIsLoading(true);
    try {
      const { data: visitors, error: visitorsError } = await supabaseBrowser
        .from("visitor_signins" as any)
        .select("id, name, site_id, signed_in_at")
        .is("signed_out_at", null)
        .order("signed_in_at", { ascending: false });

      if (visitorsError) throw visitorsError;

      const { data: contractors, error: contractorsError } = await supabaseBrowser
        .from("contractor_signins" as any)
        .select("id, name, site_id, signed_in_at, company")
        .is("signed_out_at", null)
        .order("signed_in_at", { ascending: false });

      if (contractorsError) throw contractorsError;

      const combined: SignedInPerson[] = [
        ...(visitors || []).map((v: any) => ({
          ...v,
          type: "visitor" as const,
          site_name: v.site_id ? siteMap.get(v.site_id) || null : null,
        })),
        ...(contractors || []).map((c: any) => ({
          ...c,
          type: "contractor" as const,
          site_name: c.site_id ? siteMap.get(c.site_id) || null : null,
        })),
      ];

      combined.sort((a, b) => a.name.localeCompare(b.name));
      setSignedInPeople(combined);
    } catch (err) {
      console.error("Error loading signed in people:", err);
      setError("Failed to load signed in people");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPeople = useMemo(() => {
    return signedInPeople.filter((person) => {
      const matchesSearch = searchQuery
        ? person.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesSite = selectedSite
        ? person.site_id === selectedSite
        : true;
      return matchesSearch && matchesSite;
    });
  }, [signedInPeople, searchQuery, selectedSite]);

  const handleSignOut = async (person: SignedInPerson) => {
    setSigningOut(person.id);
    setError(null);

    try {
      const table = person.type === "visitor" ? "visitor_signins" : "contractor_signins";
      const { error: updateError } = await (supabaseBrowser as any)
        .from(table)
        .update({ signed_out_at: new Date().toISOString() })
        .eq("id", person.id);

      if (updateError) throw updateError;
      
      onSuccess();
    } catch (err: any) {
      console.error("Error signing out:", err);
      setError(err.message || "Failed to sign out. Please try again.");
      setSigningOut(null);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-NZ", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Sign Out</CardTitle>
        <CardDescription>
          Select your name from the list below to sign out
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">
            Loading...
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery || selectedSite
              ? "No matching people currently signed in"
              : "No one is currently signed in"}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredPeople.map((person) => (
              <div
                key={`${person.type}-${person.id}`}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium">{person.name}</div>
                  <div className="text-sm text-gray-500">
                    {person.type === "contractor" && person.company && (
                      <span>{person.company} &bull; </span>
                    )}
                    <span className="capitalize">{person.type}</span>
                    {person.site_name && (
                      <span> &bull; {person.site_name}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    Signed in: {formatTime(person.signed_in_at)}
                  </div>
                </div>
                <Button
                  onClick={() => handleSignOut(person)}
                  disabled={signingOut === person.id}
                  variant="outline"
                  className="ml-4 border-orange-500 text-orange-600 hover:bg-orange-50"
                >
                  {signingOut === person.id ? "Signing out..." : "Sign Out"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-start pt-4 border-t">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
