import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AttachmentViewer, type ViewerItem } from "./attachment-viewer";
import { MAX_FILES_PER_TRANSACTION, type UseAttachmentsReturn } from "../hooks/use-attachments";

interface AttachmentManagerProps {
  manager: UseAttachmentsReturn;
}

interface DisplayItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  isStaged: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentManager({ manager }: AttachmentManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<ViewerItem | null>(null);

  const items: DisplayItem[] = useMemo(
    () => [
      ...manager.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        blob: a.blob,
        isStaged: false,
      })),
      ...manager.stagedFiles.map((s) => ({
        id: s.id,
        name: s.file.name,
        mimeType: s.file.type,
        size: s.file.size,
        blob: s.file as Blob,
        isStaged: true,
      })),
    ],
    [manager.attachments, manager.stagedFiles]
  );

  // One object URL per item, revoked when the set changes or on unmount.
  const objectUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.id, URL.createObjectURL(item.blob));
    return map;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    };
  }, [objectUrls]);

  async function handleRemove(item: DisplayItem) {
    if (item.isStaged) {
      manager.removeStagedFile(item.id);
    } else {
      await manager.removeAttachment(item.id);
    }
  }

  function handleOpen(item: DisplayItem) {
    const url = objectUrls.get(item.id);
    if (!url) return;
    if (item.mimeType === "application/pdf") {
      window.open(url, "_blank", "noopener");
    } else {
      setViewing({ name: item.name, url });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Receipts (optional)</Label>
        <span className="font-mono text-[10px] text-muted-foreground/50">
          {manager.totalCount}/{MAX_FILES_PER_TRANSACTION} · max 5 MB each
        </span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const isImage = item.mimeType.startsWith("image/");
            return (
              <div
                key={item.id}
                className={cn(
                  "group relative border border-border/60 bg-muted/20",
                  item.isStaged && "border-dashed"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  className="block size-16 overflow-hidden"
                  aria-label={`View ${item.name}`}
                  title={`${item.name} · ${formatSize(item.size)}`}
                >
                  {isImage ? (
                    <img
                      src={objectUrls.get(item.id)}
                      alt={item.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="size-full flex flex-col items-center justify-center gap-1 p-1">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="font-mono text-[8px] text-muted-foreground/60 truncate w-full text-center">
                        {item.name}
                      </span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="absolute -top-1.5 -right-1.5 size-4 bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={async (e) => {
          if (e.target.files?.length) await manager.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {manager.totalCount < MAX_FILES_PER_TRANSACTION && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip data-icon="inline-start" />
          Attach receipt
        </Button>
      )}

      <AttachmentViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
