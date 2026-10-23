type RecognitionLanguage = "en-US" | "ta";

export const NitroDigitalInk = {
  isAvailable: () => false,

  isModelDownloaded: async (
    _language: RecognitionLanguage
  ): Promise<boolean> => {
    return false;
  },

  downloadModel: async (
    _language: RecognitionLanguage
  ): Promise<void> => {
    throw new Error(
      "Handwriting recognition is not supported on the web."
    );
  },

  recognize: async (
    _strokes: any[],
    _language: RecognitionLanguage
  ): Promise<any> => {
    throw new Error(
      "Handwriting recognition is available in the Android app only."
    );
  },

  deleteModel: async (
    _language: RecognitionLanguage
  ): Promise<void> => {
    throw new Error(
      "Handwriting model management is not supported on the web."
    );
  },
};