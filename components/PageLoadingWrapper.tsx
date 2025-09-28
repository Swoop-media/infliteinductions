'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import LoadingSpinner from './LoadingSpinner';

export default function PageLoadingWrapper({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Hide loading when page changes are complete
    setIsLoading(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    // Intercept all anchor tag clicks and form submissions to show loading
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (anchor && anchor.href && !anchor.target && !anchor.hasAttribute('data-no-loading')) {
        // Check if it's an internal navigation
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin) {
          setIsLoading(true);
        }
      }
    };

    const handleSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (!form.hasAttribute('data-no-loading')) {
        setIsLoading(true);
      }
    };

    // Add event listeners
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);

    // Handle browser back/forward buttons
    const handlePopState = () => {
      setIsLoading(true);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('submit', handleSubmit);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <>
      {isLoading && (
        <LoadingSpinner 
          fullScreen 
          message="Loading, please wait..." 
          size="large" 
        />
      )}
      {children}
    </>
  );
}