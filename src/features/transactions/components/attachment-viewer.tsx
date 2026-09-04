import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ViewerItem {
  name: string;
  url: string;
}

interface AttachmentViewerProps {
  item: ViewerItem | null;
  onClose: () => void;
}

export function AttachmentViewer({ item, onClose }: AttachmentViewerProps) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs tracking-widest uppercase truncate">
            {item?.name}
          </DialogTitle>
        </DialogHeader>
        {item && (
          <img
            src={item.url}
            alt={item.name}
            className="max-h-[70svh] w-full object-contain bg-muted/20"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
