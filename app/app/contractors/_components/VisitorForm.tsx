"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface VisitorFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function VisitorForm({ onBack, onSuccess }: VisitorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
  });

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
