// app/privacy/page.ts
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  // No JSX in .ts files — use React.createElement
  return React.createElement(
    "main",
    { className: "mx-auto max-w-3xl px-6 py-12" },
    [
      React.createElement(
        "h1",
        { className: "text-3xl font-semibold tracking-tight", key: "h1" },
        "Privacy Policy"
      ),
      React.createElement(
        "p",
        { className: "mt-4 text-sm text-gray-500", key: "updated" },
        `Last updated: ${new Date().toLocaleDateString()}`
      ),
      React.createElement(
        "section",
        { className: "mt-8 space-y-4 leading-7", key: "section" },
        [
          React.createElement(
            "p",
            { key: "intro" },
            "This Privacy Policy explains how we collect, use, and safeguard your information when you use our services. By accessing or using the app, you agree to the terms described here."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-collect" },
            "Information We Collect"
          ),
          React.createElement(
            "p",
            { key: "collect" },
            "We may collect account details (e.g., name, email) and event data needed to deliver notifications in Microsoft Teams. We do not sell personal information."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-use" },
            "How We Use Information"
          ),
          React.createElement(
            "p",
            { key: "use" },
            "We use your information to authenticate you, send operational notifications, maintain service reliability, and improve the product."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-sharing" },
            "Data Sharing"
          ),
          React.createElement(
            "p",
            { key: "sharing" },
            "We may share limited data with service providers (e.g., Microsoft Teams/Graph) strictly to enable app features. We require appropriate safeguards and do not permit secondary use."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-security" },
            "Security"
          ),
          React.createElement(
            "p",
            { key: "security" },
            "We apply administrative, technical, and physical controls to protect data. No system is 100% secure, but we continuously improve our safeguards."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-rights" },
            "Your Rights"
          ),
          React.createElement(
            "p",
            { key: "rights" },
            "You may request access, correction, or deletion of your data where applicable. Contact us using the details below."
          ),

          React.createElement(
            "h2",
            { className: "mt-6 text-xl font-medium", key: "h2-contact" },
            "Contact"
          ),
          React.createElement(
            "p",
            { key: "contact" },
            [
              "For privacy questions or requests, email ",
              React.createElement(
                "a",
                {
                  href: "mailto:privacy@yourdomain.com",
                  className: "underline underline-offset-4",
                  key: "link",
                },
                "privacy@yourdomain.com"
              ),
              ".",
            ]
          ),
        ]
      ),
    ]
  );
}
