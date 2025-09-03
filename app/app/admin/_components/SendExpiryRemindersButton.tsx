
"use client";

import { useState } from "react";

export default function SendExpiryRemindersButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSendReminders = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/send-expiry-reminders', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert('Expiry reminders sent!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSendReminders}
      disabled={isLoading}
      className="rounded-md bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-50"
    >
      {isLoading ? 'Sending...' : 'Send Expiry Reminders'}
    </button>
  );
}
