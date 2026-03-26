'use client';

import { useState } from 'react';

export function SendButton() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    setStatus('sending');
    try {
      const res = await fetch('/api/daily-hanzi', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        if (data.message === 'Already sent today') {
          setStatus('sent');
          setMessage('Already sent today');
        } else {
          setStatus('sent');
          setMessage(`Sent ${data.wordCount} characters to Telegram!`);
        }
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to send');
      }
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  };

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${status === 'error' ? 'text-vermillion-600' : 'text-jade-600'}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleSend}
        disabled={status === 'sending'}
        className="btn-primary text-sm"
      >
        {status === 'sending' ? 'Sending...' :
         status === 'sent' ? '✓ Sent' :
         'Send Now'}
      </button>
    </div>
  );
}
