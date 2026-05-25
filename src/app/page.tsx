"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  HardDrive, FolderOpen, Folder as FolderIcon, File as FileIcon, FileImage, FileCode, FileText, Upload, Trash2, RefreshCw, ChevronRight, Search, ArrowLeft, MoreVertical, Download, Copy, Grid, List as ListIcon, Check, ExternalLink, Info, X, ArrowUp, ArrowDown, Plus, FileAudio, FileVideo, LogOut
} from "lucide-react";
import { toast } from "sonner";
import {
  listBuckets, listFiles, deleteFile, getUploadUrl, getObjectUrl, copyFile, readFileContent, saveFileContent, Bucket, R2Object, R2Folder, getInitialData, login, logout
} from "./actions";
import Editor from "@monaco-editor/react";

// --- Utility Functions ---
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function getFileIcon(fileName: string, iconSize = 18) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <FileImage size={iconSize} className="text-purple-400" />;
  if (['ts', 'js', 'json', 'html', 'css', 'py', 'java'].includes(ext || '')) return <FileCode size={iconSize} className="text-blue-400" />;
  if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext || '')) return <FileText size={iconSize} className="text-green-400" />;
  if (['mp4', 'webm', 'mov'].includes(ext || '')) return <FileVideo size={iconSize} className="text-red-400" />;
  if (['mp3', 'wav', 'ogg'].includes(ext || '')) return <FileAudio size={iconSize} className="text-yellow-400" />;
  return <FileIcon size={iconSize} className="text-gray-400" />;
}

// --- Interfaces ---
interface TabData {
  id: string;
  name: string;
  level: 'buckets' | 'files';
  bucket: string | null;
  prefix: string;
  viewMode: 'grid' | 'list';
  search: string;
  sortField: 'name' | 'size' | 'date';
  sortDirection: 'asc' | 'desc';
  files: R2Object[];
  folders: R2Folder[];
  loading: boolean;
}

export default function R2Manager() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(true);

  const [tabs, setTabs] = useState<TabData[]>([
    { id: "tab-1", name: "Home", level: 'buckets', bucket: null, prefix: "", viewMode: 'list', search: "", sortField: 'name', sortDirection: 'asc', files: [], folders: [], loading: false }
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");

  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<R2Object | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unsupported' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [clipboard, setClipboard] = useState<{ item: R2Object, action: 'copy' | 'move' } | null>(null);
  const [draggedItem, setDraggedItem] = useState<R2Object | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [conflictModal, setConflictModal] = useState<{ isOpen: boolean, file: File | R2Object, targetBucket: string, targetKey: string, resolve: ((action: 'overwrite' | 'skip' | 'rename' | 'cancel', newName?: string) => void) | null }>({
    isOpen: false, file: {} as any, targetBucket: "", targetKey: "", resolve: null
  });

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: R2Object | R2Folder, type: 'file' | 'folder' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getInitialData().then(({ isAuthenticated, buckets, error }) => {
      setIsAuthenticated(isAuthenticated);
      if (isAuthenticated && buckets) {
        setBuckets(buckets);
        setBucketsLoading(false);
      } else if (!isAuthenticated) {
        setBucketsLoading(false);
      }
      if (error) toast.error("Failed to load buckets: " + error);
    });
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId)!;

  const updateTab = (id: string, data: Partial<TabData>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const handlePasscodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPasscode(val);
    
    if (val.length > 0) {
      setLoginLoading(true);
      const res = await login(val);
      if (res.success) setIsAuthenticated(true);
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setPasscode("");
  };

  const loadGlobalBuckets = async () => {
    setBucketsLoading(true);
    const res = await listBuckets();
    if (res.success && res.buckets) setBuckets(res.buckets);
    else toast.error("Failed to load buckets: " + res.error);
    setBucketsLoading(false);
  };

  const loadFilesForTab = async (tabId: string, bucketName: string, prefix: string) => {
    updateTab(tabId, { loading: true, bucket: bucketName, prefix, level: 'files' });
    const res = await listFiles(bucketName, prefix);
    if (res.success) {
      updateTab(tabId, { files: res.files || [], folders: res.folders || [], loading: false, name: prefix ? prefix.split('/').filter(Boolean).pop() : bucketName });
    } else {
      toast.error("Failed to load files: " + res.error);
      updateTab(tabId, { loading: false });
    }
  };

  const addNewTab = () => {
    const newId = "tab-" + Date.now();
    setTabs([...tabs, { id: newId, name: "Home", level: 'buckets', bucket: null, prefix: "", viewMode: 'list', search: "", sortField: 'name', sortDirection: 'asc', files: [], folders: [], loading: false }]);
    setActiveTabId(newId);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[0].id);
  };

  const handleOpenBucket = (bucketName: string) => {
    loadFilesForTab(activeTabId, bucketName, "");
  };

  const handleOpenFolder = (prefix: string) => {
    if (!activeTab.bucket) return;
    loadFilesForTab(activeTabId, activeTab.bucket, prefix);
    updateTab(activeTabId, { search: "" });
  };

  const handleGoUp = () => {
    if (!activeTab.bucket) return;
    if (activeTab.prefix === "") {
      updateTab(activeTabId, { level: 'buckets', bucket: null, files: [], folders: [], name: "Home" });
    } else {
      const parts = activeTab.prefix.split('/').filter(Boolean);
      parts.pop();
      const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
      loadFilesForTab(activeTabId, activeTab.bucket, newPrefix);
    }
    updateTab(activeTabId, { search: "" });
  };

  const handleRefresh = () => {
    if (activeTab.level === 'buckets') loadGlobalBuckets();
    else if (activeTab.bucket) loadFilesForTab(activeTabId, activeTab.bucket, activeTab.prefix);
  };

  const handleDelete = async (key: string) => {
    if (!activeTab.bucket || !confirm(`Are you sure you want to delete "${key}"?`)) return;
    const oldFiles = [...activeTab.files];
    updateTab(activeTabId, { files: activeTab.files.filter(f => f.Key !== key) });
    const res = await deleteFile(activeTab.bucket, key);
    if (!res.success) {
      toast.error("Delete failed: " + res.error);
      updateTab(activeTabId, { files: oldFiles });
    } else {
      toast.success("File deleted");
      if (selectedFile?.Key === key) { setSelectedFile(null); setShowPreview(false); }
    }
  };

  const handleFileClick = async (file: R2Object) => {
    setSelectedFile(file);
    setShowPreview(true);
    setPreviewUrl(null);
    setPreviewContent(null);
    setIsEditing(false);

    if (!activeTab.bucket) return;
    const urlRes = await getObjectUrl(activeTab.bucket, file.Key);
    if (urlRes.success && urlRes.url) {
      setPreviewUrl(urlRes.url);
      const ext = file.Key.split('.').pop()?.toLowerCase() || '';
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) setPreviewType('image');
      else if (['mp4', 'webm', 'mov'].includes(ext)) setPreviewType('video');
      else if (['mp3', 'wav', 'ogg'].includes(ext)) setPreviewType('audio');
      else if (['pdf'].includes(ext)) setPreviewType('pdf');
      else if (['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'py', 'sh', 'yaml', 'yml', 'xml', 'env', 'config'].includes(ext)) {
        setPreviewType('text');
        const contentRes = await readFileContent(activeTab.bucket, file.Key);
        if (contentRes.success) setPreviewContent(contentRes.content || "");
      } else {
        setPreviewType('unsupported');
      }
    } else {
      toast.error("Failed to get preview link");
    }
  };

  const handleEditFile = () => {
    setIsEditing(true);
    setEditContent(previewContent || "");
  };

  const handleSaveFile = async () => {
    if (!activeTab.bucket || !selectedFile) return;
    setIsSaving(true);
    const contentType = selectedFile.Key.endsWith('.json') ? 'application/json' : 'text/plain';
    const res = await saveFileContent(activeTab.bucket, selectedFile.Key, editContent, contentType);
    if (res.success) {
      toast.success("File saved successfully");
      setPreviewContent(editContent);
      setIsEditing(false);
      loadFilesForTab(activeTabId, activeTab.bucket, activeTab.prefix);
    } else {
      toast.error("Failed to save file: " + res.error);
    }
    setIsSaving(false);
  };

  const triggerDownload = async (key: string) => {
    if (!activeTab.bucket) return;
    const res = await getObjectUrl(activeTab.bucket, key, true);
    if (res.success && res.url) {
      const a = document.createElement('a');
      a.href = res.url;
      a.download = key.split('/').pop() || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else toast.error("Download failed");
  };

  const handleConflict = (file: File | R2Object, targetBucket: string, targetKey: string): Promise<{ action: 'overwrite' | 'skip' | 'rename' | 'cancel', newName?: string }> => {
    return new Promise((resolve) => {
      setConflictModal({ isOpen: true, file, targetBucket, targetKey, resolve: (action, newName) => {
        setConflictModal({ isOpen: false, file: {} as any, targetBucket: "", targetKey: "", resolve: null });
        resolve({ action, newName });
      }});
    });
  };

  const uploadFile = async (file: File) => {
    if (!activeTab.bucket) return;
    const key = activeTab.prefix + file.name;
    const existing = activeTab.files.find(f => f.Key === key);
    let finalKey = key;

    if (existing) {
      const { action, newName } = await handleConflict(file, activeTab.bucket, key);
      if (action === 'cancel' || action === 'skip') return;
      if (action === 'rename' && newName) finalKey = activeTab.prefix + newName;
    }

    setUploading(true);
    try {
      const { success, url, error } = await getUploadUrl(activeTab.bucket, finalKey, file.type);
      if (!success || !url) throw new Error(error || "Failed to get upload URL");
      const uploadRes = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Upload to R2 failed");
      toast.success(`Uploaded ${file.name}`);
      await loadFilesForTab(activeTabId, activeTab.bucket, activeTab.prefix);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopyMove = async (source: R2Object, targetPrefix: string, isMove: boolean) => {
    if (!activeTab.bucket) return;
    const fileName = source.Key.split('/').pop();
    let destKey = targetPrefix + fileName;

    if (source.Key === destKey) { toast.info("Source and destination are the same"); return; }
    const existing = activeTab.files.find(f => f.Key === destKey);
    
    if (existing) {
        const { action, newName } = await handleConflict(source, activeTab.bucket, destKey);
        if (action === 'cancel' || action === 'skip') return;
        if (action === 'rename' && newName) destKey = targetPrefix + newName;
    }

    toast.loading(isMove ? "Moving..." : "Copying...", { id: 'copy-move' });
    const res = await copyFile(activeTab.bucket, source.Key, destKey, isMove);
    if (res.success) {
      toast.success(isMove ? "Moved successfully" : "Copied successfully", { id: 'copy-move' });
      await loadFilesForTab(activeTabId, activeTab.bucket, activeTab.prefix);
      setClipboard(null);
    } else {
      toast.error(`Failed: ${res.error}`, { id: 'copy-move' });
    }
  };

  const handleDragStart = (e: React.DragEvent, file: R2Object) => {
    setDraggedItem(file);
    e.dataTransfer.setData("application/r2-file", JSON.stringify(file));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDrop = async (e: React.DragEvent, folderPrefix: string) => {
    e.preventDefault(); e.stopPropagation();
    const fileData = e.dataTransfer.getData("application/r2-file");
    if (fileData) {
      try {
        const file: R2Object = JSON.parse(fileData);
        await handleCopyMove(file, folderPrefix, true);
      } catch (err) { console.error(err); }
    }
    setDraggedItem(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (activeTab.level !== 'files' || !activeTab.bucket) return;
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) await uploadFile(file);
  };

  const sortFiles = (filesToSort: R2Object[]) => {
    return [...filesToSort].sort((a, b) => {
      let valA: any = a.Key; let valB: any = b.Key;
      if (activeTab.sortField === 'size') { valA = a.Size; valB = b.Size; }
      else if (activeTab.sortField === 'date') { valA = new Date(a.LastModified).getTime(); valB = new Date(b.LastModified).getTime(); }
      if (valA < valB) return activeTab.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return activeTab.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filteredBuckets = buckets.filter(b => b.Name.toLowerCase().includes(activeTab.search.toLowerCase()));
  const filteredFolders = activeTab.folders.filter(f => f.Name.toLowerCase().includes(activeTab.search.toLowerCase()));
  const filteredFiles = sortFiles(activeTab.files.filter(f => f.Key.toLowerCase().includes(activeTab.search.toLowerCase())));

  if (isAuthenticated === null) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white"><RefreshCw className="animate-spin text-orange-500" size={32} /></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-sans">
        <div className="bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl w-full max-w-sm text-center">
          <HardDrive className="text-orange-500 mx-auto mb-4" size={48} />
          <h1 className="text-2xl font-bold text-white mb-2">Access System</h1>
          <p className="text-gray-400 text-sm mb-6">Enter your passcode to access buckets</p>
          <div className="flex flex-col gap-4 relative">
            <input 
              type="password" 
              name="system_passcode_field" 
              autoComplete="new-password"
              value={passcode} 
              onChange={handlePasscodeChange} 
              placeholder="Passcode" 
              className="bg-black/50 border border-white/10 p-3 rounded-lg text-white focus:border-orange-500 focus:outline-none transition w-full pr-10" 
            />
            {loginLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-orange-500 mt-0.5">
                <RefreshCw className="animate-spin" size={18} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] font-sans antialiased flex flex-col items-center overflow-hidden h-screen">
      <div className="w-full flex-1 flex flex-col h-full overflow-hidden relative shadow-2xl bg-[#0a0a0a]">
        
        {/* TABS */}
        <div className="flex bg-black/60 border-b border-white/10 px-2 pt-2 gap-1 overflow-x-auto select-none">
          {tabs.map(tab => (
            <div key={tab.id} onClick={() => setActiveTabId(tab.id)} className={`group relative flex items-center gap-2 px-4 py-2 min-w-[120px] max-w-[200px] cursor-pointer rounded-t-lg transition-colors ${activeTabId === tab.id ? 'bg-[#1a1a1a] text-white border-t border-x border-white/10' : 'bg-transparent text-gray-500 hover:bg-white/5'}`}>
              <span className="truncate flex-1 text-sm">{tab.name}</span>
              {tabs.length > 1 && <X size={14} className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" onClick={(e) => closeTab(e, tab.id)} />}
            </div>
          ))}
          <button onClick={addNewTab} className="px-3 py-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-t-lg transition-colors"><Plus size={16} /></button>
          <div className="flex-1"></div>
          <button onClick={handleLogout} className="px-4 py-2 text-red-500 hover:bg-red-500/10 flex items-center gap-2 text-sm transition-colors"><LogOut size={16} /> Logout</button>
        </div>

        {/* TOOLBAR */}
        <div className="p-3 border-b border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 bg-[#1a1a1a] z-20 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden w-full md:w-auto">
            {activeTab.level === 'files' ? (
              <button onClick={handleGoUp} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"><ArrowLeft size={16} /></button>
            ) : <HardDrive size={20} className="text-orange-500" />}
            <div className="flex items-center gap-1 text-sm text-gray-400 overflow-hidden whitespace-nowrap">
              <span className="hover:text-white cursor-pointer font-medium" onClick={() => updateTab(activeTabId, { level: 'buckets', bucket: null, prefix: "", name: "Home" })}>root</span>
              {activeTab.prefix.split('/').filter(Boolean).map((part, i, arr) => (
                <React.Fragment key={i}>
                  <ChevronRight size={14} />
                  <span className={`hover:text-white cursor-pointer ${i === arr.length - 1 ? 'text-orange-400' : ''}`} onClick={() => loadFilesForTab(activeTabId, activeTab.bucket!, arr.slice(0, i + 1).join('/') + '/')}>{part}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            <div className="relative group min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input type="text" placeholder="Search..." className="w-full pl-9 h-8 rounded bg-black/40 border border-white/10 text-sm focus:border-orange-500 focus:outline-none" value={activeTab.search} onChange={(e) => updateTab(activeTabId, { search: e.target.value })} />
            </div>
            <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
              <button className={`p-1.5 rounded transition-all ${activeTab.viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'}`} onClick={() => updateTab(activeTabId, { viewMode: 'list' })}><ListIcon size={14} /></button>
              <button className={`p-1.5 rounded transition-all ${activeTab.viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500'}`} onClick={() => updateTab(activeTabId, { viewMode: 'grid' })}><Grid size={14} /></button>
            </div>
            <button className="p-2 rounded hover:bg-white/10 text-gray-400 transition-colors" onClick={handleRefresh}><RefreshCw size={16} className={activeTab.loading || bucketsLoading ? "animate-spin" : ""} /></button>
            {activeTab.level === 'files' && (
              <>
                <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                <button className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-2 transition" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />} Upload
                </button>
              </>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 flex overflow-hidden relative" onDragOver={(e) => { e.preventDefault(); if (activeTab.level === 'files') setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
          {isDragging && (
            <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-orange-500 border-dashed m-4 rounded-xl">
              <Upload size={48} className="text-orange-500 animate-bounce mb-4" />
              <p className="text-xl font-bold text-white">Drop files to upload</p>
            </div>
          )}

          {/* MAIN LIST */}
          <div className={`flex-1 overflow-auto p-4 transition-all ${showPreview ? 'mr-0 md:mr-96' : ''}`} onClick={() => { if (window.innerWidth < 768) setShowPreview(false); setSelectedFile(null); }}>
            {activeTab.loading || (bucketsLoading && activeTab.level === 'buckets') ? (
              // Skeleton Loader
              <div className="flex flex-col gap-3">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
              </div>
            ) : activeTab.level === 'buckets' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredBuckets.map(b => (
                  <div key={b.Name} onClick={() => handleOpenBucket(b.Name)} className="bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-xl cursor-pointer transition flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400"><HardDrive size={24} /></div>
                    <div className="overflow-hidden flex-1"><h3 className="font-medium truncate">{b.Name}</h3><p className="text-xs text-gray-500">{formatDate(b.CreationDate)}</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {activeTab.viewMode === 'list' && (
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10 uppercase">
                    <div className="col-span-6 cursor-pointer hover:text-white" onClick={() => updateTab(activeTabId, { sortField: 'name', sortDirection: activeTab.sortDirection === 'asc' ? 'desc' : 'asc' })}>Name {activeTab.sortField === 'name' && (activeTab.sortDirection === 'asc' ? '↑' : '↓')}</div>
                    <div className="col-span-2 text-right cursor-pointer hover:text-white" onClick={() => updateTab(activeTabId, { sortField: 'size', sortDirection: activeTab.sortDirection === 'asc' ? 'desc' : 'asc' })}>Size {activeTab.sortField === 'size' && (activeTab.sortDirection === 'asc' ? '↑' : '↓')}</div>
                    <div className="col-span-3 text-right cursor-pointer hover:text-white" onClick={() => updateTab(activeTabId, { sortField: 'date', sortDirection: activeTab.sortDirection === 'asc' ? 'desc' : 'asc' })}>Date {activeTab.sortField === 'date' && (activeTab.sortDirection === 'asc' ? '↑' : '↓')}</div>
                    <div className="col-span-1"></div>
                  </div>
                )}
                
                <div className={activeTab.viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4" : ""}>
                  {filteredFolders.map(folder => activeTab.viewMode === 'list' ? (
                    <div key={folder.Prefix} onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder.Prefix); }} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: folder, type: 'folder' }); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleFolderDrop(e, folder.Prefix)} className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 items-center hover:bg-white/5 cursor-pointer">
                      <div className="col-span-6 flex items-center gap-3"><FolderIcon size={18} className="text-yellow-500 fill-yellow-500/20" /><span className="truncate">{folder.Name}</span></div>
                      <div className="col-span-2"></div><div className="col-span-3"></div><div className="col-span-1"></div>
                    </div>
                  ) : (
                    <div key={folder.Prefix} onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder.Prefix); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleFolderDrop(e, folder.Prefix)} className="bg-white/5 hover:bg-white/10 p-4 rounded-xl flex flex-col items-center text-center gap-2 cursor-pointer border border-transparent">
                      <FolderIcon size={40} className="text-yellow-500 fill-yellow-500/20" /><span className="text-sm truncate w-full">{folder.Name}</span>
                    </div>
                  ))}

                  {filteredFiles.map(file => activeTab.viewMode === 'list' ? (
                    <div key={file.Key} draggable onDragStart={(e) => handleDragStart(e, file)} onClick={(e) => { e.stopPropagation(); handleFileClick(file); }} className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 items-center cursor-pointer ${selectedFile?.Key === file.Key ? 'bg-orange-500/10' : 'hover:bg-white/5'}`}>
                      <div className="col-span-6 flex items-center gap-3"><div className="w-5">{getFileIcon(file.Key)}</div><span className={`truncate ${selectedFile?.Key === file.Key ? 'text-orange-400' : ''}`}>{file.Key.split('/').pop()}</span></div>
                      <div className="col-span-2 text-right text-xs text-gray-500">{formatBytes(file.Size)}</div>
                      <div className="col-span-3 text-right text-xs text-gray-500">{formatDate(file.LastModified)}</div>
                      <div className="col-span-1 text-right relative">
                        <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, item: file, type: 'file' }); }} className="text-gray-500 hover:text-white"><MoreVertical size={16} /></button>
                      </div>
                    </div>
                  ) : (
                    <div key={file.Key} draggable onDragStart={(e) => handleDragStart(e, file)} onClick={(e) => { e.stopPropagation(); handleFileClick(file); }} className={`p-4 rounded-xl flex flex-col items-center text-center gap-3 cursor-pointer border ${selectedFile?.Key === file.Key ? 'bg-orange-500/10 border-orange-500/40' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                      <div className="h-12 flex items-center justify-center">{getFileIcon(file.Key, 36)}</div>
                      <div className="w-full"><p className={`text-xs truncate ${selectedFile?.Key === file.Key ? 'text-orange-400' : ''}`}>{file.Key.split('/').pop()}</p><p className="text-[10px] text-gray-500 mt-1">{formatBytes(file.Size)}</p></div>
                    </div>
                  ))}
                </div>
                {activeTab.files.length === 0 && activeTab.folders.length === 0 && !activeTab.loading && (
                   <div className="text-center text-gray-500 mt-20">This folder is empty. Drop files here to upload.</div>
                )}
              </div>
            )}
          </div>

          {/* PREVIEW PANEL */}
          {showPreview && selectedFile && (
            <div className="absolute right-0 top-0 bottom-0 w-full md:w-96 bg-[#111] border-l border-white/10 flex flex-col shadow-2xl z-30 transform transition-transform">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h3 className="font-medium truncate pr-4 text-orange-400">{selectedFile.Key.split('/').pop()}</h3>
                <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-4 flex-1 overflow-auto flex flex-col gap-4">
                <div className="bg-black/50 rounded-xl overflow-hidden min-h-[200px] flex items-center justify-center border border-white/5 relative">
                  {!previewUrl && previewType !== 'text' ? <RefreshCw className="animate-spin text-gray-500" /> : null}
                  {previewType === 'image' && <img src={previewUrl!} alt="preview" className="max-w-full max-h-64 object-contain" />}
                  {previewType === 'video' && <video src={previewUrl!} controls className="max-w-full max-h-64" />}
                  {previewType === 'audio' && <audio src={previewUrl!} controls className="w-full px-4" />}
                  {previewType === 'pdf' && <iframe src={previewUrl!} className="w-full h-96 border-none" />}
                  {previewType === 'unsupported' && <div className="text-center text-gray-500"><FileIcon size={48} className="mx-auto mb-2 opacity-50" /><p>Preview not available</p></div>}
                  
                  {previewType === 'text' && (
                    <div className="absolute inset-0 bg-[#1e1e1e]">
                      {isEditing ? (
                        <Editor height="100%" language={selectedFile.Key.split('.').pop()} theme="vs-dark" value={editContent} onChange={v => setEditContent(v || "")} options={{ minimap: { enabled: false }, fontSize: 13 }} />
                      ) : (
                        <Editor height="100%" language={selectedFile.Key.split('.').pop()} theme="vs-dark" value={previewContent || ""} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                  <div className="bg-white/5 p-3 rounded-lg"><p className="text-[10px] uppercase mb-1">Size</p><p className="text-white">{formatBytes(selectedFile.Size)}</p></div>
                  <div className="bg-white/5 p-3 rounded-lg"><p className="text-[10px] uppercase mb-1">Modified</p><p className="text-white">{formatDate(selectedFile.LastModified)}</p></div>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  <button className="btn w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded flex justify-center items-center gap-2" onClick={() => triggerDownload(selectedFile.Key)}><Download size={16} /> Download</button>
                  {previewType === 'text' && !isEditing && <button className="btn w-full bg-white/10 hover:bg-white/20 py-2 rounded flex justify-center items-center gap-2" onClick={handleEditFile}>Edit File</button>}
                  {isEditing && (
                    <div className="flex gap-2">
                      <button className="btn flex-1 bg-green-600 hover:bg-green-700 py-2 rounded flex justify-center items-center gap-2" onClick={handleSaveFile} disabled={isSaving}>{isSaving ? <RefreshCw className="animate-spin" size={16} /> : "Save Changes"}</button>
                      <button className="btn flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 py-2 rounded" onClick={() => setIsEditing(false)}>Cancel</button>
                    </div>
                  )}
                  <button className="btn w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 py-2 rounded flex justify-center items-center gap-2" onClick={() => handleDelete(selectedFile.Key)}><Trash2 size={16} /> Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONFLICT MODAL */}
      {conflictModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-white/10 p-6 rounded-xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">File Already Exists</h3>
            <p className="text-sm text-gray-400 mb-6 break-all">"{conflictModal.targetKey.split('/').pop()}" already exists in this location.</p>
            <div className="flex flex-col gap-2">
              <button className="bg-orange-500 hover:bg-orange-600 text-white py-2 rounded transition font-medium" onClick={() => conflictModal.resolve?.('overwrite')}>Replace</button>
              <button className="bg-white/10 hover:bg-white/20 text-white py-2 rounded transition font-medium" onClick={() => {
                const parts = conflictModal.targetKey.split('.');
                const ext = parts.length > 1 ? `.${parts.pop()}` : '';
                const name = parts.join('.');
                conflictModal.resolve?.('rename', `${name.split('/').pop()}_copy${ext}`);
              }}>Keep Both (Rename)</button>
              <button className="bg-transparent hover:bg-white/5 text-gray-400 py-2 rounded transition font-medium" onClick={() => conflictModal.resolve?.('skip')}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div className="fixed bg-[#1a1a1a] border border-white/10 shadow-2xl rounded-lg py-1 w-48 z-50 text-sm overflow-hidden" style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 200) }}>
          {contextMenu.type === 'file' && (
            <>
              <button className="w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" onClick={() => { triggerDownload((contextMenu.item as R2Object).Key); setContextMenu(null); }}><Download size={14} /> Download</button>
              <button className="w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" onClick={() => { setClipboard({ item: contextMenu.item as R2Object, action: 'copy' }); setContextMenu(null); toast.info("Copied to clipboard"); }}><Copy size={14} /> Copy</button>
              <div className="h-px bg-white/10 my-1"></div>
              <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2" onClick={() => { handleDelete((contextMenu.item as R2Object).Key); setContextMenu(null); }}><Trash2 size={14} /> Delete</button>
            </>
          )}
          {contextMenu.type === 'folder' && (
            <div className="px-4 py-2 text-gray-500 italic">Folder actions coming soon</div>
          )}
        </div>
      )}
    </main>
  );
}
