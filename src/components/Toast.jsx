import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export default function Toast({ message, type, onClose }) {
  // Auto-dismiss after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const isSuccess = type === 'success';

  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border border-gray-100 bg-white min-w-[300px] animate-slide-in transition-all duration-300 transform translate-y-0 opacity-100`}>
      {/* Icon */}
      <div className={`p-2 rounded-full ${isSuccess ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
        {isSuccess ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h4 className={`text-sm font-bold ${isSuccess ? 'text-green-800' : 'text-red-800'}`}>
          {isSuccess ? 'Success' : 'Error'}
        </h4>
        <p className="text-sm text-gray-600">{message}</p>
      </div>

      {/* Close Button */}
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
      
      {/* Loading Bar Animation (Optional visual flair) */}
      <div className={`absolute bottom-0 left-0 h-1 ${isSuccess ? 'bg-green-500' : 'bg-red-500'} animate-shrink`} style={{ width: '100%' }}></div>
    </div>
  );
}