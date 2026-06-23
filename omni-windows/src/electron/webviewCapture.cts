import { ipcRenderer } from 'electron';

const BUTTON_ID = 'omni-save-memo-button';
const MIN_SELECTION_LENGTH = 3;
let hideTimer: number | undefined;

function removeButton(): void {
  window.clearTimeout(hideTimer);
  document.getElementById(BUTTON_ID)?.remove();
}

function getSelectedText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return rect;
}

function showSaveButton(): void {
  const text = getSelectedText();

  if (text.length < MIN_SELECTION_LENGTH) {
    removeButton();
    return;
  }

  const rect = getSelectionRect();

  if (!rect) {
    removeButton();
    return;
  }

  let button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;

  if (!button) {
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '메모로 저장';
    button.style.position = 'fixed';
    button.style.zIndex = '2147483647';
    button.style.border = '1px solid rgba(255,255,255,0.24)';
    button.style.borderRadius = '8px';
    button.style.padding = '8px 10px';
    button.style.color = '#ffffff';
    button.style.background = '#2f2a24';
    button.style.boxShadow = '0 8px 24px rgba(0,0,0,0.28)';
    button.style.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    button.style.cursor = 'pointer';

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const selectedText = getSelectedText();

      if (selectedText.length >= MIN_SELECTION_LENGTH) {
        ipcRenderer.sendToHost('omni-save-memo', {
          text: selectedText,
          url: window.location.href,
          title: document.title,
        });
      }

      removeButton();
    });

    document.documentElement.appendChild(button);
  }

  const buttonWidth = button.offsetWidth || 96;
  const left = Math.min(Math.max(8, rect.right - buttonWidth), window.innerWidth - buttonWidth - 8);
  const top = Math.min(Math.max(8, rect.bottom + 8), window.innerHeight - 42);

  button.style.left = `${left}px`;
  button.style.top = `${top}px`;
}

function scheduleSelectionCheck(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(showSaveButton, 80);
}

document.addEventListener('selectionchange', scheduleSelectionCheck);
document.addEventListener('mouseup', scheduleSelectionCheck);
document.addEventListener(
  'mousedown',
  (event) => {
    const target = event.target as Element | null;

    if (!target?.closest(`#${BUTTON_ID}`)) {
      removeButton();
    }
  },
  true,
);
window.addEventListener('scroll', removeButton, true);
window.addEventListener('resize', removeButton);
