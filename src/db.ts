export const STORAGE_KEY = "excalihub_files";
export const FOLDERS_KEY = "excalihub_folders";

export interface ExcalidrawRecord {
  id: string;
  name: string;
  data: string;
  savedAt: number;
  folderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

async function _getAll(): Promise<ExcalidrawRecord[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExcalidrawRecord[] | undefined) || [];
}

async function _setAll(files: ExcalidrawRecord[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: files });
}

async function _getAllFolders(): Promise<Folder[]> {
  const result = await chrome.storage.local.get(FOLDERS_KEY);
  return (result[FOLDERS_KEY] as Folder[] | undefined) || [];
}

async function _setAllFolders(folders: Folder[]): Promise<void> {
  await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
}

export async function saveFile(name: string, data: string): Promise<ExcalidrawRecord> {
  const files = await _getAll();
  const record: ExcalidrawRecord = {
    id: crypto.randomUUID(),
    name,
    data,
    savedAt: Date.now(),
  };
  files.push(record);
  await _setAll(files);
  return record;
}

export async function getAllFiles(): Promise<ExcalidrawRecord[]> {
  const files = await _getAll();
  return files.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getFile(id: string): Promise<ExcalidrawRecord | undefined> {
  const files = await _getAll();
  return files.find((f) => f.id === id);
}

export async function deleteFile(id: string): Promise<void> {
  const files = await _getAll();
  await _setAll(files.filter((f) => f.id !== id));
}

export async function updateFileData(id: string, data: string): Promise<void> {
  const files = await _getAll();
  const file = files.find((f) => f.id === id);
  if (!file) throw new Error("File not found");
  file.data = data;
  file.savedAt = Date.now();
  await _setAll(files);
}

export async function updateFileName(id: string, newName: string): Promise<void> {
  const files = await _getAll();
  const file = files.find((f) => f.id === id);
  if (!file) throw new Error("File not found");
  file.name = newName;
  await _setAll(files);
}

export async function moveFileToFolder(id: string, folderId: string | undefined): Promise<void> {
  const files = await _getAll();
  const file = files.find((f) => f.id === id);
  if (!file) throw new Error("File not found");
  file.folderId = folderId;
  await _setAll(files);
}

export async function getAllFolders(): Promise<Folder[]> {
  const folders = await _getAllFolders();
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(name: string): Promise<Folder> {
  const folders = await _getAllFolders();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
  };
  folders.push(folder);
  await _setAllFolders(folders);
  return folder;
}

export async function renameFolder(id: string, newName: string): Promise<void> {
  const folders = await _getAllFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error("Folder not found");
  folder.name = newName;
  await _setAllFolders(folders);
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await _getAllFolders();
  await _setAllFolders(folders.filter((f) => f.id !== id));
  const files = await _getAll();
  for (const file of files) {
    if (file.folderId === id) file.folderId = undefined;
  }
  await _setAll(files);
}
