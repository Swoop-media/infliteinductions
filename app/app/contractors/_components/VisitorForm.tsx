"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Site {
  id: string;
  name: string;
}

interface Person {
  id: string;
  full_name: string;
  site_id: string | null;
  site_name?: string | null;
}

interface VisitorFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function VisitorForm({ onBack, onSuccess }: VisitorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitePeople, setSitePeople] = useState<Person[]>([]);
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    site_id: "",
    visiting_user_id: "",
  });

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
      } finally {
        setLoadingSites(false);
      }
    };

    fetchSites();
  }, []);

  useEffect(() => {
    const fetchSitePeople = async () => {
      if (!formData.site_id) {
        setSitePeople([]);
        return;
      }

      setLoadingPeople(true);
      try {
        const { data: users, error: usersError } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, site_id")
          .is("archived_at", null)
          .eq("site_id", formData.site_id)
          .order("full_name", { ascending: true });

        if (usersError) throw usersError;
        setSitePeople(users || []);
      } catch (err) {
        console.error("Error fetching people:", err);
      } finally {
        setLoadingPeople(false);
      }
    };

    fetchSitePeople();
    setSearchQuery("");
    setSearchResults([]);
    setFormData(prev => ({ ...prev, visiting_user_id: "" }));
  }, [formData.site_id]);

  useEffect(() => {
    const searchPeople = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // Fetch sites first for lookup
        const { data: sitesData } = await supabaseBrowser
          .from("sites" as any)
          .select("id, name");
        const siteMap = new Map((sitesData || []).map((s: any) => [s.id, s.name]));
        
        const { data, error } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, site_id")
          .ilike("full_name", `%${searchQuery}%`)
          .order("full_name", { ascending: true })
          .limit(50);

        if (error) {
          console.error("Search error:", error);
          throw error;
        }
        
        const formattedData = (data || []).map((p: any) => ({
          ...p,
          site_name: p.site_id ? siteMap.get(p.site_id) || null : null
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
  }, [searchQuery, sitePeople]);

  const handleSiteChange = (siteId: string) => {
    setFormData({ ...formData, site_id: siteId });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = supabaseBrowser;
      const signedInAt = new Date().toISOString();
      
      const { error: insertError } = await supabase
        .from("visitor_signins" as any)
        .insert({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          site_id: formData.site_id,
          visiting_user_id: formData.visiting_user_id,
          signed_in_at: signedInAt,
        } as any);

      if (insertError) {
        throw insertError;
      }

      // Send Teams notification to the person being visited
      if (formData.visiting_user_id) {
        const selectedSite = sites.find(s => s.id === formData.site_id);
        try {
          await fetch("/api/notify/visitor-signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visitorName: formData.name,
              visitorEmail: formData.email,
              visitorPhone: formData.phone,
              visitingUserId: formData.visiting_user_id,
              siteName: selectedSite?.name || null,
              signedInAt,
            }),
          });
        } catch (notifyErr) {
          console.error("Failed to send Teams notification:", notifyErr);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Visitor Sign In</CardTitle>
          <CardDescription>Please enter your details to sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site">Site / Location</Label>
              <select
                id="site"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.site_id}
                onChange={(e) => handleSiteChange(e.target.value)}
                required
              >
                <option value="">{loadingSites ? "Loading..." : "Select a site"}</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Contact Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Enter your phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visiting">Who are you visiting?</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={!formData.site_id ? "Select a site first" : "Type to search for a person..."}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.length < 2) {
                      setFormData({ ...formData, visiting_user_id: "" });
                    }
                  }}
                  disabled={!formData.site_id}
                />
                {formData.visiting_user_id && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                    Selected: {searchResults.find(p => p.id === formData.visiting_user_id)?.full_name || 
                              sitePeople.find(p => p.id === formData.visiting_user_id)?.full_name || 
                              "Unknown"}
                  </div>
                )}
                {formData.site_id && (searchQuery.length >= 2 || sitePeople.length > 0) && !formData.visiting_user_id && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {isSearching || loadingPeople ? (
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
                              onClick={() => {
                                setFormData({ ...formData, visiting_user_id: person.id });
                                setSearchQuery(person.full_name);
                              }}
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
                            onClick={() => {
                              setFormData({ ...formData, visiting_user_id: person.id });
                              setSearchQuery(person.full_name);
                            }}
                          >
                            {person.full_name}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              {formData.site_id && sitePeople.length === 0 && !loadingPeople && searchQuery.length < 2 && !formData.visiting_user_id && (
                <p className="text-sm text-gray-500">Type at least 2 characters to search for people.</p>
              )}
              <input type="hidden" name="visiting_user_id" value={formData.visiting_user_id} required />
            </div>

            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
