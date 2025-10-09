// Calculate authorization expiry date based on the earliest of:
// 1. First document expiry date
// 2. First course expiry date (from valid_for_months field)
// 3. Authorization validity period (valid_for_days field)

interface Document {
  expires_on: string | null;
}

interface Course {
  valid_for_months?: number | null;
  completed_at?: string | null;
}

export function calculateAuthorizationExpiry(
  approvalDate: Date,
  authValidForDays: number | null,
  documents: Document[],
  courses: Course[]
): Date | null {
  const expiryDates: Date[] = [];
  
  // 1. Authorization validity period
  if (authValidForDays && authValidForDays > 0) {
    const authExpiry = new Date(approvalDate);
    authExpiry.setDate(authExpiry.getDate() + authValidForDays);
    expiryDates.push(authExpiry);
  }
  
  // 2. Document expiry dates
  documents.forEach(doc => {
    if (doc.expires_on) {
      const docExpiry = new Date(doc.expires_on);
      if (!isNaN(docExpiry.getTime()) && docExpiry > approvalDate) {
        expiryDates.push(docExpiry);
      }
    }
  });
  
  // 3. Course expiry dates (based on valid_for_months)
  courses.forEach(course => {
    if (course.valid_for_months && course.valid_for_months > 0) {
      const courseExpiry = new Date(approvalDate);
      courseExpiry.setMonth(courseExpiry.getMonth() + course.valid_for_months);
      expiryDates.push(courseExpiry);
    }
  });
  
  // Return the earliest expiry date
  if (expiryDates.length === 0) {
    return null; // No expiry
  }
  
  return new Date(Math.min(...expiryDates.map(d => d.getTime())));
}

export function formatExpiryDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  return `${month} ${day}, ${year}`;
}

export function getDaysUntilExpiry(expiryDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);
  
  const timeDiff = expiryDate.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

export function getExpiryStatus(daysUntilExpiry: number): {
  status: 'current' | 'expiring_soon' | 'expired';
  color: string;
  text: string;
} {
  if (daysUntilExpiry < 0) {
    return {
      status: 'expired',
      color: 'text-red-600',
      text: `${Math.abs(daysUntilExpiry)} days overdue`
    };
  } else if (daysUntilExpiry === 0) {
    return {
      status: 'expired',
      color: 'text-red-600',
      text: 'Due today'
    };
  } else if (daysUntilExpiry <= 30) {
    return {
      status: 'expiring_soon',
      color: 'text-yellow-600',
      text: `${daysUntilExpiry} days remaining`
    };
  } else {
    return {
      status: 'current',
      color: 'text-green-600',
      text: `${daysUntilExpiry} days remaining`
    };
  }
}