import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createCvFormData } from "@/lib/cv/file";
import { listResumes, uploadResume } from "@/lib/cv/api";
import { CV_MIME_TYPES, type CvNotice, type Resume, type UploadProgress } from "@/lib/cv/types";

type ListState = {
  ownerId: string | null;
  resumes: Resume[];
  loaded: boolean;
  error: string | null;
};

export function useMyCv() {
  const { session } = useAuth();
  const ownerId = session?.user?.id ?? null;
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const [list, setList] = useState<ListState>({ ownerId, resumes: [], loaded: false, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<CvNotice | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const uploadRequest = useRef<AbortController | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async (): Promise<Resume[] | null> => {
    if (!ownerId) return null;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setRefreshing(true);
    try {
      const resumes = await listResumes(ownerId, controller.signal);
      if (!controller.signal.aborted && owner.current === ownerId) {
        setList({ ownerId, resumes, loaded: true, error: null });
        return resumes;
      }
    } catch (error) {
      if (!controller.signal.aborted && owner.current === ownerId) {
        setList((previous) => ({
          ownerId,
          resumes: previous.ownerId === ownerId ? previous.resumes : [],
          loaded: true,
          error:
            error instanceof Error
              ? error.message
              : "Your CVs could not be loaded. Please try again.",
        }));
      }
    } finally {
      if (listRequest.current === controller && owner.current === ownerId) setRefreshing(false);
    }
    return null;
  }, [ownerId]);

  useEffect(() => {
    owner.current = ownerId;
    setList({ ownerId, resumes: [], loaded: false, error: null });
    setNotice(null);
    setUploadProgress(null);
    setPicking(false);
    setRefreshing(false);
    busy.current = false;
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      owner.current = null;
      listRequest.current?.abort();
      uploadRequest.current?.abort();
      foreground.remove();
    };
  }, [ownerId, refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const visibleList =
    list.ownerId === ownerId ? list : { ownerId, resumes: [], loaded: false, error: null };
  const hasProcessing = visibleList.resumes.some(
    (cv) => cv.processing_status === "pending" || cv.processing_status === "processing",
  );

  useEffect(() => {
    if (!ownerId || !hasProcessing) return;
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [ownerId, hasProcessing, refresh]);

  const upload = useCallback(async () => {
    if (!ownerId || busy.current) return;
    busy.current = true;
    setNotice(null);
    setPicking(true);
    let attemptedUpload = false;
    const controller = new AbortController();
    uploadRequest.current = controller;
    try {
      // Open directly from the tap, which browsers require for their file picker.
      const result = await DocumentPicker.getDocumentAsync({
        type: Object.values(CV_MIME_TYPES),
        multiple: false,
        copyToCacheDirectory: true,
        base64: false,
      });
      if (controller.signal.aborted || owner.current !== ownerId || result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error("No file was selected. Please choose your CV again.");
      const form = createCvFormData(asset);
      setPicking(false);
      setUploadProgress({ phase: "uploading", percent: null });
      attemptedUpload = true;
      const saved = await uploadResume(ownerId, form, controller.signal, (progress) => {
        if (owner.current === ownerId && !controller.signal.aborted) setUploadProgress(progress);
      });
      if (controller.signal.aborted || owner.current !== ownerId) return;
      // Keep the confirmed original even when the subsequent list request fails.
      setList((previous) => ({
        ownerId,
        loaded: true,
        error: null,
        resumes: [
          saved,
          ...(previous.ownerId === ownerId ? previous.resumes : []).filter(
            (cv) => cv.id !== saved.id,
          ),
        ],
      }));
      setNotice(
        saved.processing_status === "failed" || saved.recovery_required
          ? {
              tone: "info",
              message: "CV uploaded. Processing could not finish, but your original is saved.",
            }
          : {
              tone: "success",
              message:
                saved.processing_status === "ready"
                  ? "CV uploaded successfully."
                  : "CV uploaded. Processing is in progress.",
            },
      );
      setUploadProgress(null);
      busy.current = false;
      await refresh();
    } catch (error) {
      if (controller.signal.aborted || owner.current !== ownerId) return;
      // A failed processing response can still leave a safely stored original.
      if (attemptedUpload) await refresh();
      if (controller.signal.aborted || owner.current !== ownerId) return;
      const message = error instanceof Error ? error.message : "Your CV could not be uploaded.";
      setNotice({
        tone: "error",
        message: attemptedUpload
          ? message +
            " Check your CVs below before uploading again; the original may have been saved."
          : message,
      });
    } finally {
      if (uploadRequest.current === controller && owner.current === ownerId) {
        setPicking(false);
        setUploadProgress(null);
        busy.current = false;
      }
    }
  }, [ownerId, refresh]);

  return {
    resumes: visibleList.resumes,
    listError: visibleList.error,
    loading: !!ownerId && !visibleList.loaded,
    refreshing,
    picking,
    uploadProgress,
    notice,
    dismissNotice: () => setNotice(null),
    refresh,
    upload,
  };
}
