"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Department {
  id: string;
  name: string;
}

interface Person {
  id: string;
  full_name: string;
  department: string | null;
}

interface VisitorFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function VisitorForm({ onBack, onSuccess }: VisitorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentPeople, setDepartmentPeople] = useState<Person[]>([]);
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDepartmentName, setSelectedDepartmentName] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    department_id: "",
    visiting_user_id: "",
  });

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabaseBrowser
          .from("departments" as any)
          .select("id, name")
          .order("name", { ascending: true });

        if (error) throw error;
        setDepartments(data || []);
      } catch (err) {
        console.error("Error fetching departments:", err);
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, []);

  useEffect(() => {
    const fetchDepartmentPeople = async () => {
      if (!selectedDepartmentName) {
        setDepartmentPeople([]);
        return;
      }

      setLoadingPeople(true);
      try {
        const { data: users, error: usersError } = await supabaseBrowser
          .from("profiles" as any)
          .select("id, full_name, department")
          .is("archived_at", null)
          .eq("department", selectedDepartmentName)
          .order("full_name", { ascending: true });

        if (usersError) throw usersError;
        setDepartmentPeople(users || []);
      } catch (err) {
        console.error("Error fetching people:", err);
      } finally {
        setLoadingPeople(false);
      }
    };

    fetchDepartmentPeople();
    setSearchQuery("");
    setSearchResults([]);
    setFormData(prev => ({ ...prev, visiting_user_id: "" }));
  }, [selectedDepartmentName]);

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
          .select("id, full_name, department")
          .ilike("full_name", `%${searchQuery}%`)
          .order("full_name", { ascending: true })
          .limit(50);

        if (error) {
          console.error("Search error:", error);
          throw error;
        }
        
        console.log("Search results for", searchQuery, ":", data?.length || 0, "users found");
        setSearchResults(data || []);
      } catch (err) {
        console.error("Error searching people:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchPeople, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, departmentPeople]);

  const handleDepartmentChange = (departmentId: string) => {
    const dept = departments.find(d => d.id === departmentId);
    setSelectedDepartmentName(dept?.name || "");
    setFormData({ ...formData, department_id: departmentId });
  };

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
          department_id: formData.department_id,
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
              <Label htmlFor="department">Base / Department</Label>
              <select
                id="department"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.department_id}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                required
              >
                <option value="">{loadingDepartments ? "Loading..." : "Select a department"}</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
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
                placeholder={!formData.department_id ? "Select a department first" : "Search by name..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={!formData.department_id}
                className="mb-2"
              />
              <select
                id="visiting"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.visiting_user_id}
                onChange={(e) => setFormData({ ...formData, visiting_user_id: e.target.value })}
                required
                disabled={!formData.department_id}
              >
                <option value="">
                  {!formData.department_id 
                    ? "Select a department first" 
                    : loadingPeople || isSearching
                      ? "Loading..." 
                      : "Select a person"}
                </option>
                {searchQuery.length >= 2 ? (
                  searchResults.length > 0 ? (
                    <optgroup label="Search results">
                      {searchResults.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name}{person.department ? ` (${person.department})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                ) : (
                  departmentPeople.length > 0 && (
                    <optgroup label="People in this department">
                      {departmentPeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name}
                        </option>
                      ))}
                    </optgroup>
                  )
                )}
              </select>
              {formData.department_id && departmentPeople.length === 0 && !loadingPeople && searchQuery.length < 2 && (
                <p className="text-sm text-gray-500">No people in this department. Use search to find people.</p>
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
