"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { photoUploadId, type PhotoState } from "./photo-selection";
import { uploadProductPhoto } from "./direct-image-upload";

export function usePhotoUploads(files: File[], productId: string | undefined, enabled: boolean) {
  const [states, setStates] = useState<Record<string, PhotoState>>({});
  const stateRef = useRef<Record<string, PhotoState>>({});
  const running = useRef(false);
  const batchId = useRef<string | null>(null);
  const batchComplete = useRef(false);
  const mounted = useRef(true);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const retry = useCallback(async () => {
    if (!productId || !enabled || !files.length || running.current) return;
    if (files.every((file) => stateRef.current[photoUploadId(file)]?.status === "uploaded")) return;
    running.current = true;
    await Promise.resolve();
    function mark(id: string, state: PhotoState) {
      stateRef.current = { ...stateRef.current, [id]: state };
      if (mounted.current) setStates(stateRef.current);
    }
    if (mounted.current) { setUploadState("uploading"); setUploadError(""); }
    try {
      if (batchComplete.current) batchId.current = null;
      batchComplete.current = false;
      batchId.current ??= crypto.randomUUID();
      let firstError = "";
      // Continue after a failure; server registration restores selected batch order on retry.
      for (const [position, file] of files.entries()) {
        if (!mounted.current) return;
        const id = photoUploadId(file);
        if (stateRef.current[id]?.status === "uploaded") continue;
        mark(id, { status: "uploading" });
        try {
          await uploadProductPhoto(file, { productId, uploadId: id, batchId: batchId.current, position },
            (progress) => mark(id, { status: "uploading", progress }));
          mark(id, { status: "uploaded" });
        } catch (caught) {
          const error = caught instanceof Error ? caught.message : "No fue posible subir la foto.";
          mark(id, { status: "failed", error }); firstError ||= error;
        }
      }
      if (firstError) throw new Error(firstError);
      batchComplete.current = true;
      if (mounted.current) setUploadState("done");
    } catch (caught) {
      if (mounted.current) { setUploadState("error"); setUploadError((caught as Error).message); }
    } finally { running.current = false; }
  }, [enabled, files, productId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void retry(); }, 0);
    return () => window.clearTimeout(timer);
  }, [retry]);
  return { states, uploadState, uploadError, retry };
}
