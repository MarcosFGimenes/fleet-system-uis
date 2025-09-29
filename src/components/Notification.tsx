import React from 'react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  const baseClasses = "fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white z-50";
  let typeClasses = "";

  switch (type) {
    case 'success':
      typeClasses = "bg-emerald-600";
      break;
    case 'error':
      typeClasses = "bg-red-600";
      break;
    case 'warning':
      typeClasses = "bg-amber-600";
      break;
    case 'info':
      typeClasses = "bg-blue-600";
      break;
    default:
      typeClasses = "bg-gray-600";
  }

  return (
    <div className={`${baseClasses} ${typeClasses}`}>
      <div className="flex justify-between items-center">
        <p>{message}</p>
        <button onClick={onClose} className="ml-4 text-white font-bold">
          &times;
        </button>
      </div>
    </div>
  );
};

export default Notification;

