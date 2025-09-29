import { useState, useCallback } from 'react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationState {
  message: string;
  type: NotificationType;
  show: boolean;
}

export function useNotification() {
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: 'info',
    show: false,
  });

  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    setNotification({
      message,
      type,
      show: true,
    });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 5000); // Notificação desaparece após 5 segundos
  }, []);

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, show: false }));
  }, []);

  return { notification, showNotification, hideNotification };
}

