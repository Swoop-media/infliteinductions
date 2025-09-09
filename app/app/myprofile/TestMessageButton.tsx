// @ts-nocheck

"use client";

import { useState } from "react";

interface TestMessageButtonProps {
  userId: string;
}

export default function TestMessageButton({ userId }: TestMessageButtonProps) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const sendTestMessage = async () => {
    setSending(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/teams/bot/debug-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          message: "🧪 Test notification from your learning platform!" 
        })
      });

      if (response.ok) {
        setResult("✅ Test message sent successfully!");
      } else {
        const error = await response.text();
        setResult(`❌ Failed: ${response.status} - ${error}`);
      }
    } catch (error) {
      setResult(`❌ Error: ${error}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={sendTestMessage}
        disabled={sending}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send Test Message"}
      </button>
      {result && (
        <div className="text-xs p-2 rounded bg-gray-50">
          {result}
        </div>
      )}
    </div>
  );
}
