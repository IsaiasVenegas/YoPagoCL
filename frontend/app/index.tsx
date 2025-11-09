import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { getAuthToken } from '@/services/api';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // Defer navigation until after the Root Layout has mounted
    const timer = setTimeout(() => {
      // Check if user is authenticated
      const token = getAuthToken();
      if (token) {
        router.replace('/home');
      } else {
        router.replace('/login');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [router]);

  return null; // Will redirect immediately
}
