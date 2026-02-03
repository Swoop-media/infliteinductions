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
  department: string | null;
  department_id: string | null;
  is_site_user?: boolean;
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
  const [siteDepartmentIds, setSiteDepartmentIds] = useState<string[]>([]);
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
        setSiteDepartmentIds([]);
        return;
      }

      setLoadingPeople(true);
      try {
        const { data: siteDepts, error: deptError } = await supabaseBrowser
          .from("site_departments" as any)
          .select("department_id")
          .eq("site_id", formData.site_id);

        if (deptError) {
          console.error("Error fetching site departments:", deptError);
          const { data: allUsers, error: usersError } = await supabaseBrowser
            .from("profiles" as any)
            .select("id, full_name, department, department_id")
            .is("archived_at", null)
            .order("full_name", { ascending: true });

          if (usersError) throw usersError;
          setSitePeople((allUsers || []).map((u: Person) => ({ ...u, is_site_user: true })));
        } else {
          const deptIds = (siteDepts || []).map((d: any) => d.department_id);
          setSiteDepartmentIds(deptIds);

          if (deptIds.length > 0) {
            const { data: users, error: usersError } = await supabaseBrowser
              .from("profiles" as any)
              .select("id, full_name, department, department_id")
              .is("archived_at", null)
              .in("department_id", deptIds)
              .order("full_name", { ascending: true });

            if (usersError) throw usersError;
            setSitePeople((users || []).map((u: Person) => ({ ...u, is_site_user: true })));
          } else {
            setSitePeople([]);
          }
        }
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
        const { data, error } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, department, department_id")
          .is("archived_at", null)
          .ilike("full_name", `%${searchQuery}%`)
          .order("full_name", { ascending: true })
          .limit(20);

        if (error) throw error;
        
        const siteUserIds = sitePeople.map(p => p.id);
        const otherUsers = (data || []).filter((u: Person) => !siteUserIds.includes(u.id));
        setSearchResults(otherUsers);
      } catch (err) {
        console.error("Error searching people:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchPeople, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, sitePeople]);

  const allPeople = [...sitePeople, ...searchResults];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = supabaseBrowser;
      
      const { error: insertError } = await supabase
        .from("visitor_signins" as any)
        .insert({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          site_id: formData.site_id,
          visiting_user_id: formData.visiting_user_id,
          signed_in_at: new Date().toISOString(),
        } as any);

      if (insertError) {
        throw insertError;
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
              <Label htmlFor="site">Base</Label>
              <select
                id="site"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.site_id}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                required
              >
                <option value="">{loadingSites ? "Loading..." : "Select a base"}</option>
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
              <Input
                type="text"
                placeholder={!formData.site_id ? "Select a base first" : "Search by name..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={!formData.site_id}
                className="mb-2"
              />
              <select
                id="visiting"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.visiting_user_id}
                onChange={(e) => setFormData({ ...formData, visiting_user_id: e.target.value })}
                required
                disabled={!formData.site_id}
              >
                <option value="">
                  {!formData.site_id 
                    ? "Select a base first" 
                    : loadingPeople || isSearching
                      ? "Loading..." 
                      : "Select a person"}
                </option>
                {sitePeople.length > 0 && (
                  <optgroup label="People at this base">
                    {sitePeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}{person.department ? ` (${person.department})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {searchResults.length > 0 && (
                  <optgroup label="Other people (search results)">
                    {searchResults.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}{person.department ? ` (${person.department})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {formData.site_id && sitePeople.length === 0 && !loadingPeople && searchQuery.length < 2 && (
                <p className="text-sm text-gray-500">No departments linked to this base. Use search to find people.</p>
              )}
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
