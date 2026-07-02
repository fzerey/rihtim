export interface FileEntry {
  name: string;
  isDir: boolean;
  isLink: boolean;
  size: number;
  mode: number;
  mtime: number;
  linkTarget?: string;
}

export interface FileListResponse {
  path: string;
  isDir: boolean;
  truncated: boolean;
  entries: FileEntry[];
}

export interface FileResponse {
  path: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  content: string;
  encoding: "utf-8" | "base64";
}
