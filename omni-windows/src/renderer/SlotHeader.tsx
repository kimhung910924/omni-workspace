import type { MouseEventHandler, PointerEventHandler } from 'react';
import type { ProviderId } from './providerUrlStore';
import { ProviderIcon } from './ProviderIcon';

type SlotHeaderProps = {
  providerId: ProviderId;
  label: string;
  canDock: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onDock: () => void;
  onClose: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
};

export function SlotHeader({
  providerId,
  label,
  canDock,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onHome,
  onDock,
  onClose,
  onPointerDown,
  onClickCapture,
}: SlotHeaderProps) {
  return (
    <div className="slot-header" onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
      <div className="slot-header-group slot-header-nav" aria-label={`${label} navigation`}>
        <button className="slot-icon-button" type="button" title="Back" aria-label={`${label} back`} disabled={!canGoBack} onClick={onBack}>
          {'<'}
        </button>
        <button
          className="slot-icon-button"
          type="button"
          title="Forward"
          aria-label={`${label} forward`}
          disabled={!canGoForward}
          onClick={onForward}
        >
          {'>'}
        </button>
        <button className="slot-icon-button" type="button" title="Reload" aria-label={`${label} reload`} onClick={onReload}>
          R
        </button>
      </div>

      <div className="slot-provider">
        <ProviderIcon providerId={providerId} label={label} />
        <span className="slot-provider-label">{label}</span>
      </div>

      <div className="slot-header-group slot-header-window" aria-label={`${label} slot actions`}>
        <button className="slot-icon-button" type="button" title="New chat" aria-label={`${label} new chat`} onClick={onHome}>
          H
        </button>
        <button
          className="slot-icon-button"
          type="button"
          title={canDock ? 'Send to dock' : 'Keep at least one chat open'}
          aria-label={canDock ? `${label} send to dock` : `${label} cannot send last chat to dock`}
          disabled={!canDock}
          onClick={onDock}
        >
          v
        </button>
        <button className="slot-icon-button danger" type="button" title="Close" aria-label={`${label} close`} onClick={onClose}>
          x
        </button>
      </div>
    </div>
  );
}
