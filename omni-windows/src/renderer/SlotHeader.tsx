import type { ProviderId } from './providerUrlStore';
import { ProviderIcon } from './ProviderIcon';

type SlotHeaderProps = {
  providerId: ProviderId;
  label: string;
  isCollapsed: boolean;
  canCollapse: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onToggleCollapse: () => void;
  onClose: () => void;
};

export function SlotHeader({
  providerId,
  label,
  isCollapsed,
  canCollapse,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onHome,
  onToggleCollapse,
  onClose,
}: SlotHeaderProps) {
  const collapseLabel = isCollapsed ? `Expand ${label}` : `Collapse ${label}`;

  return (
    <div className="slot-header">
      {!isCollapsed && (
        <div className="slot-header-group slot-header-nav" aria-label={`${label} navigation`}>
          <button className="slot-icon-button" type="button" title="Back" aria-label={`${label} back`} disabled={!canGoBack} onClick={onBack}>
            ‹
          </button>
          <button
            className="slot-icon-button"
            type="button"
            title="Forward"
            aria-label={`${label} forward`}
            disabled={!canGoForward}
            onClick={onForward}
          >
            ›
          </button>
          <button className="slot-icon-button" type="button" title="Reload" aria-label={`${label} reload`} onClick={onReload}>
            ↻
          </button>
        </div>
      )}

      <div className="slot-provider">
        <ProviderIcon providerId={providerId} label={label} />
        <span className="slot-provider-label">{label}</span>
      </div>

      <div className="slot-header-group slot-header-window" aria-label={`${label} slot actions`}>
        {!isCollapsed && (
          <button className="slot-icon-button" type="button" title="New chat" aria-label={`${label} new chat`} onClick={onHome}>
            ⌂
          </button>
        )}
        <button
          className="slot-icon-button"
          type="button"
          title={collapseLabel}
          aria-label={collapseLabel}
          disabled={!isCollapsed && !canCollapse}
          onClick={onToggleCollapse}
        >
          {isCollapsed ? '›' : '‹'}
        </button>
        {!isCollapsed && (
          <button className="slot-icon-button danger" type="button" title="Close" aria-label={`${label} close`} onClick={onClose}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
