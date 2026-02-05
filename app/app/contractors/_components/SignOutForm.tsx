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

interface SignedPerson {
  id: string;
  name: string;
  type: "visitor" | "contractor";
  site_id: string | null;
  site_name?: string;
  signed_in_at: string;
  signed_out_at: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  visiting_user_id?: string | null;
}

interface SignOutFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function SignOutForm({ onBack, onSuccess }: SignOutFormProps) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [signedInPeople, setSignedInPeople] = useState<SignedPerson[]>([]);
  const [signedOutPeople, setSignedOutPeople] = useState<SignedPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"signedIn" | "signedOut">("signedIn");

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
    if (siteMap.size > 0 || sites.length === 0) {
      loadPeople();
    }
  }, [siteMap, sites]);

  const loadPeople = async () => {
    setIsLoading(true);
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      const { data: visitors, error: visitorsError } = await supabaseBrowser
        .from("visitor_signins" as any)
        .select("id, name, site_id, signed_in_at, signed_out_at, email, phone, visiting_user_id")
        .gte("signed_in_at", cutoffDate)
        .order("signed_in_at", { ascending: false });

      if (visitorsError) throw visitorsError;

      const { data: contractors, error: contractorsError } = await supabaseBrowser
        .from("contractor_signins" as any)
        .select("id, name, site_id, signed_in_at, signed_out_at, company, email, phone")
        .gte("signed_in_at", cutoffDate)
        .order("signed_in_at", { ascending: false });

      if (contractorsError) throw contractorsError;

      const allVisitors = (visitors || []).map((v: any) => ({
        ...v,
        type: "visitor" as const,
        site_name: v.site_id ? siteMap.get(v.site_id) || null : null,
      }));

      const allContractors = (contractors || []).map((c: any) => ({
        ...c,
        type: "contractor" as const,
        site_name: c.site_id ? siteMap.get(c.site_id) || null : null,
      }));

      const signedIn: SignedPerson[] = [...allVisitors, ...allContractors]
        .filter((p) => !p.signed_out_at)
        .sort((a, b) => a.name.localeCompare(b.name));

      const signedOut: SignedPerson[] = [...allVisitors, ...allContractors]
        .filter((p) => p.signed_out_at)
        .sort((a, b) => new Date(b.signed_out_at!).getTime() - new Date(a.signed_out_at!).getTime());

      setSignedInPeople(signedIn);
      setSignedOutPeople(signedOut);
    } catch (err) {
      console.error("Error loading people:", err);
      setError("Failed to load people");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSignedIn = useMemo(() => {
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

  const filteredSignedOut = useMemo(() => {
    return signedOutPeople.filter((person) => {
      const matchesSearch = searchQuery
        ? person.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesSite = selectedSite
        ? person.site_id === selectedSite
        : true;
      return matchesSearch && matchesSite;
    });
  }, [signedOutPeople, searchQuery, selectedSite]);

  const handleSignOut = async (person: SignedPerson) => {
    setProcessingId(person.id);
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
      setProcessingId(null);
    }
  };

  const handleSignInAgain = async (person: SignedPerson) => {
    setProcessingId(person.id);
    setError(null);

    try {
      const table = person.type === "visitor" ? "visitor_signins" : "contractor_signins";
      const signedInAt = new Date().toISOString();
      
      const insertData: any = {
        name: person.name,
        site_id: person.site_id,
        signed_in_at: signedInAt,
      };

      if (person.type === "visitor") {
        insertData.email = person.email;
        insertData.phone = person.phone;
        insertData.visiting_user_id = person.visiting_user_id;
      } else {
        insertData.email = person.email;
        insertData.phone = person.phone;
        insertData.company = person.company;
      }

      const { error: insertError } = await (supabaseBrowser as any)
        .from(table)
        .insert(insertData);

      if (insertError) throw insertError;

      alert(`${person.name} has been signed in successfully!\n\nRemember to sign out when you leave.`);
      await loadPeople();
      setActiveTab("signedIn");
    } catch (err: any) {
      console.error("Error signing in:", err);
      setError(err.message || "Failed to sign in. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-NZ", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const currentList = activeTab === "signedIn" ? filteredSignedIn : filteredSignedOut;

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Sign In / Sign Out</CardTitle>
        <CardDescription>
          {activeTab === "signedIn" 
            ? "Select your name from the list below to sign out"
            : "Find your name to sign in again"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("signedIn")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "signedIn"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Currently Signed In ({signedInPeople.length})
          </button>
          <button
            onClick={() => setActiveTab("signedOut")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "signedOut"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Sign In Again ({signedOutPeople.length})
          </button>
        </div>

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
        ) : currentList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery || selectedSite
              ? "No matching people found"
              : activeTab === "signedIn"
                ? "No one is currently signed in"
                : "No recent visitors or contractors to sign in"
            }
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {currentList.map((person) => (
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
                    {activeTab === "signedIn" 
                      ? `Signed in: ${formatTime(person.signed_in_at)}`
                      : `Last visit: ${formatTime(person.signed_out_at!)}`
                    }
                  </div>
                </div>
                {activeTab === "signedIn" ? (
                  <Button
                    onClick={() => handleSignOut(person)}
                    disabled={processingId === person.id}
                    variant="outline"
                    className="ml-4 border-orange-500 text-orange-600 hover:bg-orange-50"
                  >
                    {processingId === person.id ? "Signing out..." : "Sign Out"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSignInAgain(person)}
                    disabled={processingId === person.id}
                    className="ml-4 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {processingId === person.id ? "Signing in..." : "Sign In"}
                  </Button>
                )}
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
