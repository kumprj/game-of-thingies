import React, {useEffect, useRef, useState} from 'react';
import QRCode from 'qrcode';
import {AnimatePresence} from 'framer-motion';
import Modal from './Modal';

interface Props {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function QRCodeModal({gameId, isOpen, onClose}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/${gameId}` : `/${gameId}`;

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 220,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      }).catch((err) => console.error('Failed to generate QR code', err));
    }
  }, [isOpen, url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} role="dialog" labelledBy="qr-modal-title">
          <h3 id="qr-modal-title" style={{marginTop: 0}}>Join Room {gameId}</h3>
          <p className="footnote" style={{marginBottom: 16}}>
            Point your phone's camera at this QR code to join immediately.
          </p>
          <div style={{display: 'flex', justifyContent: 'center', marginBottom: 16}}>
            <div className="qr-container">
              <canvas ref={canvasRef} data-testid="qr-canvas" style={{display: 'block'}} />
            </div>
          </div>
          <div className="stack" style={{gap: 8}}>
            <button type="button" className="btn btn-primary btn-block" onClick={handleCopy}>
              {copied ? '✓ Copied Link!' : 'Copy Link'}
            </button>
            <button type="button" className="btn btn-gray btn-block" onClick={onClose}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
