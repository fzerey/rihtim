export {};

declare global {
  interface Window {
    rihtim?: {
      isDesktop?: boolean;
      versions?: {
        electron: string;
        chrome: string;
        node: string;
      };
      selectComposeFile?: () => Promise<string | null>;
    };
  }
}
