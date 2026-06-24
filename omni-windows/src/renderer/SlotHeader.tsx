import type { MouseEventHandler, PointerEventHandler } from 'react';
import type { ProviderId } from './providerUrlStore';
import { ProviderIcon } from './ProviderIcon';

type SlotHeaderProps = {
  providerId: ProviderId;
  label: string;
  compact?: boolean;
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

function ReloadIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.6 6.2A6.2 6.2 0 1 0 16 10" />
      <path d="M15.6 2.8v3.4h-3.4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 9.2 10 3.8l6.5 5.4" />
      <path d="M5.5 8.4v7.1h9V8.4" />
      <path d="M8.2 15.5v-4.2h3.6v4.2" />
    </svg>
  );
}

export function SlotHeader({
  providerId,
  label,
  compact = false,
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
    <div className={`slot-header ${compact ? 'compact' : ''}`} onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
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
          <ReloadIcon />
        </button>
      </div>

      <div className="slot-provider">
        <ProviderIcon providerId={providerId} label={label} />
        <span className="slot-provider-label">{label}</span>
      </div>

      <div className="slot-header-group slot-header-window" aria-label={`${label} slot actions`}>
        <button className="slot-icon-button" type="button" title="New chat" aria-label={`${label} new chat`} onClick={onHome}>
          <HomeIcon />
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
