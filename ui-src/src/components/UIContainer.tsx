import * as Dialog from '@radix-ui/react-dialog';
import { useUI } from '../contexts/UIContext';
import DetailPanel from './DetailPanel';
import CodeViewer from './CodeViewer';

export default function UIContainer() {
  const { detailPanel, closeDetail, activeCode, closeCode } = useUI();

  return (
    <>
      {/* 
          Standard Side-Panel (Drawer/Sheet) using Radix Dialog.
          This handles focus trapping, Esc-to-close, and backdrop blur natively.
      */}
      <Dialog.Root open={!!detailPanel} onOpenChange={(open) => !open && closeDetail()}>
        <Dialog.Portal>
          <Dialog.Overlay 
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1100,
                background: 'var(--pro-modal-overlay)',
                backdropFilter: 'blur(var(--pro-modal-blur))',
                animation: 'fadeIn 0.2s ease-out'
            }}
          />
          <Dialog.Content 
             style={{ 
                position: 'fixed', top: 0, right: 0, bottom: 0, 
                width: '50%', maxWidth: 800, zIndex: 1101,
                outline: 'none'
             }}
          >
            {detailPanel && (
               <DetailPanel 
                 title={detailPanel.title}
                 subTitle={detailPanel.subTitle}
                 content={detailPanel.content}
                 path={detailPanel.path}
                 onClose={closeDetail}
               />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 
          Legacy CodeViewer Bridge (Will be refactored to Radix in Phase 3)
      */}
      {activeCode && (
          <CodeViewer {...activeCode} onClose={closeCode} />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
