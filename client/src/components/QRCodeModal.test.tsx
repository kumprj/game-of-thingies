import {render, screen, act} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import QRCodeModal from './QRCodeModal';
import QRCode from 'qrcode';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('QRCodeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const {container} = render(<QRCodeModal gameId="ABCD" isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders QR code modal with canvas and copies link on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {clipboard: {writeText}});
    const onClose = vi.fn();

    render(<QRCodeModal gameId="ABCD" isOpen={true} onClose={onClose} />);

    expect(screen.getByText('Join Room ABCD')).toBeInTheDocument();
    expect(screen.getByTestId('qr-canvas')).toBeInTheDocument();
    expect(QRCode.toCanvas).toHaveBeenCalled();

    const copyBtn = screen.getByRole('button', {name: 'Copy Link'});
    await act(async () => {
      copyBtn.click();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ABCD'));
    expect(screen.getByText('✓ Copied Link!')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', {name: 'Close'});
    closeBtn.click();
    expect(onClose).toHaveBeenCalled();
  });
});
