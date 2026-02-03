"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Site {
  id: string;
  name: string;
}

interface VisitorSignin {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  site_id: string | null;
  visiting_user_id: string | null;
  signed_in_at: string | null;
  signed_out_at: string | null;
  site_name?: string;
  visiting_user_name?: string;
}

interface ContractorSignin {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  site_id: string | null;
  purpose: string | null;
  signed_in_at: string | null;
  signed_out_at: string | null;
  site_name?: string;
}

interface StaffPortalProps {
  sites: Site[];
}

type TabType = "signins" | "contractors" | "visitors";

export default function StaffPortal({ sites }: StaffPortalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("signins");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [visitors, setVisitors] = useState<VisitorSignin[]>([]);
  const [contractors, setContractors] = useState<ContractorSignin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const siteMap = useMemo(() => {
    return new Map(sites.map((s) => [s.id, s.name]));
  }, [sites]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: profilesData } = await supabaseBrowser
        .from("profiles" as any)
        .select("id, full_name");
      const profileMap = new Map(
        (profilesData || []).map((p: any) => [p.id, p.full_name])
      );

      const { data: visitorData, error: visitorError } = await supabaseBrowser
        .from("visitor_signins" as any)
        .select("*")
        .order("signed_in_at", { ascending: false });

      if (!visitorError && visitorData) {
        setVisitors(
          visitorData.map((v: any) => ({
            ...v,
            site_name: v.site_id ? siteMap.get(v.site_id) || null : null,
            visiting_user_name: v.visiting_user_id
              ? profileMap.get(v.visiting_user_id) || null
              : null,
          }))
        );
      }

      const { data: contractorData, error: contractorError } =
        await supabaseBrowser
          .from("contractor_signins" as any)
          .select("*")
          .order("signed_in_at", { ascending: false });

      if (!contractorError && contractorData) {
        setContractors(
          contractorData.map((c: any) => ({
            ...c,
            site_name: c.site_id ? siteMap.get(c.site_id) || null : null,
          }))
        );
      }
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filterBySearchAndSite = <T extends { name: string; site_id: string | null }>(
    items: T[]
  ): T[] => {
    return items.filter((item) => {
      const matchesSearch = searchQuery
        ? item.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesSite =
        selectedSite === "all" ? true : item.site_id === selectedSite;
      return matchesSearch && matchesSite;
    });
  };

  const allSignins = useMemo(() => {
    const combined = [
      ...visitors.map((v) => ({
        ...v,
        type: "visitor" as const,
      })),
      ...contractors.map((c) => ({
        ...c,
        type: "contractor" as const,
        visiting_user_name: null,
        visiting_user_id: null,
      })),
    ];

    combined.sort((a, b) => {
      const aSignedIn = !a.signed_out_at;
      const bSignedIn = !b.signed_out_at;
      if (aSignedIn !== bSignedIn) {
        return aSignedIn ? -1 : 1;
      }
      const aTime = new Date(a.signed_in_at || 0).getTime();
      const bTime = new Date(b.signed_in_at || 0).getTime();
      return bTime - aTime;
    });

    return combined;
  }, [visitors, contractors]);

  const filteredVisitors = filterBySearchAndSite(visitors);
  const filteredContractors = filterBySearchAndSite(contractors);
  const filteredSignins = filterBySearchAndSite(allSignins);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-NZ", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const handleSignOut = async (
    id: string,
    type: "visitor" | "contractor"
  ) => {
    const table =
      type === "visitor" ? "visitor_signins" : "contractor_signins";
    const { error } = await supabaseBrowser
      .from(table as any)
      .update({ signed_out_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (!error) {
      loadData();
    }
  };

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "signins", label: "Sign-ins", count: filteredSignins.length },
    { key: "contractors", label: "Contractors", count: filteredContractors.length },
    { key: "visitors", label: "Visitors", count: filteredVisitors.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={loadData}>
          Refresh
        </Button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "signins" && (
        <div className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredSignins.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No sign-ins found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Site</th>
                    <th className="text-left p-3 font-medium">Signed In</th>
                    <th className="text-left p-3 font-medium">Signed Out</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignins.map((signin) => (
                    <tr key={signin.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        {!signin.signed_out_at ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            On Site
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Left
                          </span>
                        )}
                      </td>
                      <td className="p-3 capitalize">{signin.type}</td>
                      <td className="p-3 font-medium">{signin.name}</td>
                      <td className="p-3">{signin.site_name || "-"}</td>
                      <td className="p-3">
                        {formatDateTime(signin.signed_in_at)}
                      </td>
                      <td className="p-3">
                        {formatDateTime(signin.signed_out_at)}
                      </td>
                      <td className="p-3">
                        {!signin.signed_out_at && (
                          <button
                            onClick={() => handleSignOut(signin.id, signin.type)}
                            className="text-orange-600 hover:text-orange-800 text-sm font-medium"
                          >
                            Sign Out
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "contractors" && (
        <div className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredContractors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No contractors found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Company</th>
                    <th className="text-left p-3 font-medium">Site</th>
                    <th className="text-left p-3 font-medium">Purpose</th>
                    <th className="text-left p-3 font-medium">Phone</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Signed In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContractors.map((contractor) => (
                    <tr key={contractor.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{contractor.name}</td>
                      <td className="p-3">{contractor.company || "-"}</td>
                      <td className="p-3">{contractor.site_name || "-"}</td>
                      <td className="p-3">{contractor.purpose || "-"}</td>
                      <td className="p-3">{contractor.phone || "-"}</td>
                      <td className="p-3">{contractor.email || "-"}</td>
                      <td className="p-3">
                        {formatDateTime(contractor.signed_in_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "visitors" && (
        <div className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredVisitors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No visitors found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Site</th>
                    <th className="text-left p-3 font-medium">Visiting</th>
                    <th className="text-left p-3 font-medium">Phone</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Signed In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisitors.map((visitor) => (
                    <tr key={visitor.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{visitor.name}</td>
                      <td className="p-3">{visitor.site_name || "-"}</td>
                      <td className="p-3">{visitor.visiting_user_name || "-"}</td>
                      <td className="p-3">{visitor.phone || "-"}</td>
                      <td className="p-3">{visitor.email || "-"}</td>
                      <td className="p-3">
                        {formatDateTime(visitor.signed_in_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
