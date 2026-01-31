"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  HardDrive,
  FolderOpen,
  Folder as FolderIcon,
  File as FileIcon,
  FileImage,
  FileCode,
  FileText,
  Upload,
  Trash2,
  RefreshCw,
  ChevronRight,
  Search,
  ArrowLeft,
  MoreVertical,
  Download,
  Copy,
  Grid,
  List as ListIcon,
  Check,
  ExternalLink,
  Info,
  X,
  ArrowUp,
  ArrowDown,
  Scissors,
  ClipboardPaste
} from "lucide-react";
import { toast } from "sonner";
import { listBuckets, listFiles, deleteFile, getUploadUrl, getObjectUrl, copyFile, Bucket, R2Object, R2Folder } from "./actions";

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
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getFileIcon(fileName: string, iconSize = 18) {
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <FileImage size={iconSize} className="text-purple-400" />;
  if (['ts', 'js', 'json', 'html', 'css', 'py', 'java'].includes(ext || '')) return <FileCode size={iconSize} className="text-blue-400" />;
  if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext || '')) return <FileText size={iconSize} className="text-green-400" />;

  return <FileIcon size={iconSize} className="text-gray-400" />;
}

// --- Components ---

export default function R2Manager() {
  // State
  const [level, setLevel] = useState<'buckets' | 'files'>('buckets');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Data
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [files, setFiles] = useState<R2Object[]>([]);
  const [folders, setFolders] = useState<R2Folder[]>([]);

  // Navigation
  const [currentBucket, setCurrentBucket] = useState<string | null>(null);
  const [currentPrefix, setCurrentPrefix] = useState<string>("");

  // UI State
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Clipboard
  const [clipboard, setClipboard] = useState<{ item: R2Object, action: 'copy' | 'move' } | null>(null);
  const [draggedItem, setDraggedItem] = useState<R2Object | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selection & Actions
  const [selectedFile, setSelectedFile] = useState<R2Object | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: R2Object | R2Folder, type: 'file' | 'folder' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial Load
  useEffect(() => {
    loadBuckets();
  }, []);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // --- ACTIONS ---

  const loadBuckets = async () => {
    setLoading(true);
    const res = await listBuckets();
    if (res.success && res.buckets) {
      setBuckets(res.buckets);
    } else {
      toast.error("Failed to load buckets: " + res.error);
    }
    setLoading(false);
  };

  const loadFiles = async (bucketName: string, prefix: string) => {
    setLoading(true);

    const res = await listFiles(bucketName, prefix);
    if (res.success) {
      setFiles(res.files || []);
      setFolders(res.folders || []);

      setCurrentBucket(bucketName);
      setCurrentPrefix(prefix);
      setLevel('files');
    } else {
      toast.error("Failed to load files: " + res.error);
    }
    setLoading(false);
  };

  const handleOpenBucket = (bucketName: string) => {
    loadFiles(bucketName, "");
  };

  const handleOpenFolder = (prefix: string) => {
    if (!currentBucket) return;
    loadFiles(currentBucket, prefix);
    setSearch(""); // Clear search when navigating
  };

  const handleGoUp = () => {
    if (!currentBucket) return;
    if (currentPrefix === "") {
      setLevel('buckets');
      setCurrentBucket(null);
      setFiles([]);
      setFolders([]);
    } else {
      // Remove last folder from prefix
      const parts = currentPrefix.split('/').filter(Boolean);
      parts.pop();
      const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
      loadFiles(currentBucket, newPrefix);
    }
    setSearch("");
  };

  const handleRefresh = () => {
    if (level === 'buckets') loadBuckets();
    else if (currentBucket) loadFiles(currentBucket, currentPrefix);
  };

  const handleDelete = async (key: string) => {
    if (!currentBucket || !confirm(`Are you sure you want to delete "${key}"?`)) return;

    // Optimistic update
    const oldFiles = [...files];
    setFiles(files.filter(f => f.Key !== key));

    const res = await deleteFile(currentBucket, key);
    if (!res.success) {
      toast.error("Delete failed: " + res.error);
      setFiles(oldFiles); // Revert
    } else {
      toast.success("File deleted");
      // Clear selection if deleted
      if (selectedFile?.Key === key) {
        setSelectedFile(null);
        setShowPreview(false);
      }
    }
  };

  const getPublicUrl = (key: string, bucketName: string | null) => {
    let domain: string | undefined;

    // 1. Check for bucket-specific domain overrides
    if (bucketName && process.env.NEXT_PUBLIC_R2_BUCKET_DOMAINS) {
      try {
        const domains = JSON.parse(process.env.NEXT_PUBLIC_R2_BUCKET_DOMAINS);
        if (domains[bucketName]) {
          domain = domains[bucketName];
        }
      } catch (e) {
        console.error("Failed to parse NEXT_PUBLIC_R2_BUCKET_DOMAINS", e);
      }
    }

    // 2. Fallback to explicit public URL (Preferred fallback)
    if (!domain && process.env.NEXT_PUBLIC_R2_PUBLIC_URL) {
      domain = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    }

    // 3. Fallback to generic domain variable (Historical/Default)
    if (!domain && process.env.NEXT_PUBLIC_R2_DOMAIN) {
      domain = process.env.NEXT_PUBLIC_R2_DOMAIN;
    }

    if (!domain) return null;

    // Clean domain (remove protocol if present) to ensure consistent format
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    const encodedKey = cleanKey.split('/').map(p => encodeURIComponent(p)).join('/');
    return `https://${domain}/${encodedKey}`;
  };

  const handleFileClick = (file: R2Object) => {
    setSelectedFile(file);
    setShowPreview(true);

    // Use Public URL for preview
    const url = getPublicUrl(file.Key, currentBucket);
    if (url) {
      setPreviewUrl(url);
    } else {
      // Fallback or warning
      console.warn("NEXT_PUBLIC_R2_DOMAIN not set");
      setPreviewUrl(null);
    }
  };

  const handlePublicLink = (key: string) => {
    const url = getPublicUrl(key, currentBucket);
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success("Public URL copied to clipboard");
    } else {
      toast.error("Public domain not configured (NEXT_PUBLIC_R2_DOMAIN)");
    }
  };

  const handleCopyAllLinks = () => {
    if (!filteredFiles.length) {
      toast.error("No files to copy");
      return;
    }

    // Check domain first
    if (!process.env.NEXT_PUBLIC_R2_DOMAIN) {
      toast.error("Public domain not configured");
      return;
    }

    const links = filteredFiles
      .map(f => getPublicUrl(f.Key, currentBucket))
      .filter(Boolean)
      .join('\n');

    if (links) {
      navigator.clipboard.writeText(links);
      toast.success(`Copied ${filteredFiles.length} links to clipboard`);
    }
  };

  // Replaces handleCopySignedLink with just a fallback or removal if strictly public
  // But keeping it as utility if needed, but per request "use public only", we prioritize public.

  const handleDownload = (key: string) => {
    const url = getPublicUrl(key, currentBucket);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error("Public domain not configured");
    }
  };

  const uploadFile = async (file: File) => {
    if (!currentBucket) return;
    setUploading(true);
    try {
      const key = currentPrefix + file.name;
      const { success, url, error } = await getUploadUrl(currentBucket, key, file.type);
      if (!success || !url) throw new Error(error || "Failed to get upload URL");

      const uploadRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type }
      });

      if (!uploadRes.ok) throw new Error("Upload to R2 failed");

      toast.success(`Uploaded ${file.name}`);
      await loadFiles(currentBucket, currentPrefix);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCopyMove = async (source: R2Object, targetPrefix: string, isMove: boolean) => {
    if (!currentBucket) return;

    // Check if moving to same location
    const fileName = source.Key.split('/').pop();
    const destKey = targetPrefix + fileName;

    if (source.Key === destKey) {
      toast.info("Source and destination are the same");
      return;
    }

    toast.loading(isMove ? "Moving..." : "Copying...");

    const res = await copyFile(currentBucket, source.Key, destKey, isMove);

    toast.dismiss();

    if (res.success) {
      toast.success(isMove ? "Moved successfully" : "Copied successfully");
      await loadFiles(currentBucket, currentPrefix); // Refresh current view
      setClipboard(null);
    } else {
      toast.error(`Failed to ${isMove ? 'move' : 'copy'}: ${res.error}`);
    }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    handleCopyMove(clipboard.item, currentPrefix, clipboard.action === 'move');
  };

  // --- Drag & Drop (Internal) ---

  const handleDragStart = (e: React.DragEvent, file: R2Object) => {
    setDraggedItem(file);
    e.dataTransfer.setData("application/r2-file", JSON.stringify(file));
    e.dataTransfer.effectAllowed = "move"; // We default to move for DnD
  };

  const handleFolderDrop = async (e: React.DragEvent, folderPrefix: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent main drop area from catching it

    const fileData = e.dataTransfer.getData("application/r2-file");

    if (fileData) {
      // Internal File Drop
      try {
        const file: R2Object = JSON.parse(fileData);
        await handleCopyMove(file, folderPrefix, true); // Move by default on Drag
      } catch (err) {
        console.error(err);
      }
    } else {
      // Could be external file drop ONTO a folder? 
      // For now, let's keep external drop strictly for current folder via main handler
    }
    setDraggedItem(null);
  };

  // --- Drag & Drop (External Upload) ---

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Only show overlay if dragging external files
    if (level === 'files' && !isDragging && !draggedItem) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDragging) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (level !== 'files' || !currentBucket) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Upload first file only for now (or loop for multiple could be added later)
    // To support multiple, we would loop here. Let's do simple loop.
    for (const file of files) {
      await uploadFile(file);
    }
  };

  // Sorting
  const handleSort = (field: 'name' | 'size' | 'date') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortFiles = (filesToSort: R2Object[]) => {
    return [...filesToSort].sort((a, b) => {
      let valA: any = a.Key;
      let valB: any = b.Key;

      if (sortField === 'size') {
        valA = a.Size;
        valB = b.Size;
      } else if (sortField === 'date') {
        valA = new Date(a.LastModified).getTime();
        valB = new Date(b.LastModified).getTime();
      } else {
        // Name sort - extract filename from key for better sorting if deeply nested? 
        // For R2 object keys, usually just sorting by string is fine.
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filter & Sort
  const filteredBuckets = buckets.filter(b => b.Name.toLowerCase().includes(search.toLowerCase()));

  // Filter files AND folders
  const filteredFolders = folders.filter(f => f.Name.toLowerCase().includes(search.toLowerCase()));
  const filteredFiles = sortFiles(files.filter(f => f.Key.toLowerCase().includes(search.toLowerCase())));

  // Breadcrumbs
  const breadcrumbs = currentPrefix.split('/').filter(Boolean);

  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] font-sans antialiased p-0 md:p-4 lg:p-6 flex flex-col items-center overflow-hidden h-screen">
      <div className="w-full max-w-[1600px] glass-panel flex flex-col h-full md:h-[90vh] overflow-hidden relative shadow-2xl md:rounded-xl border-none md:border md:border-white/10">

        {/* --- HEADER --- */}
        <div className="p-4 border-b border-white/10 flex flex-col gap-4 bg-white/5 backdrop-blur-md z-20 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

            {/* Title & Path */}
            <div className="flex items-center gap-3 overflow-hidden w-full md:w-auto">
              {level === 'files' ? (
                <button onClick={handleGoUp} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors mr-1">
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
                  <HardDrive size={20} />
                </div>
              )}

              <div className="flex flex-col overflow-hidden">
                <h1 className="text-lg font-bold truncate">
                  {level === 'buckets' ? 'Buckets' : currentBucket}
                </h1>

                {/* Breadcrumbs */}
                {level === 'files' && (
                  <div className="flex items-center gap-1 text-sm text-gray-400 overflow-hidden whitespace-nowrap mask-linear-fade">
                    <span className="hover:text-white cursor-pointer" onClick={() => handleGoUp()}>root</span>
                    {breadcrumbs.map((part, i) => (
                      <React.Fragment key={i}>
                        <ChevronRight size={12} />
                        <span
                          className={`hover:text-white cursor-pointer ${i === breadcrumbs.length - 1 ? 'text-orange-400 font-medium' : ''}`}
                          onClick={() => {
                            // Construct path up to this breadcrumb
                            const newPath = breadcrumbs.slice(0, i + 1).join('/') + '/';
                            handleOpenFolder(newPath);
                          }}
                        >
                          {part}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Toolbar */}
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
              {/* Search */}
              <div className="relative group min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors" size={14} />
                <input
                  type="text"
                  placeholder="Filter..."
                  className="input pl-9 h-9 py-0 text-sm bg-black/40 focus:bg-black/60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="h-6 w-[1px] bg-white/10 mx-1 hidden md:block"></div>

              {/* View Toggles */}
              <div className="flex bg-black/40 rounded-lg p-1 gap-1 border border-white/5">
                <button
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => setViewMode('list')}
                >
                  <ListIcon size={16} />
                </button>
                <button
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid size={16} />
                </button>
              </div>

              <button
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                onClick={handleRefresh}
                title="Refresh"
              >
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              </button>

              {/* Copy All Button */}
              {level === 'files' && files.length > 0 && (
                <button
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors border-l border-white/5 ml-1 pl-3"
                  onClick={handleCopyAllLinks}
                  title="Copy All Links"
                >
                  <Copy size={18} />
                </button>
              )}

              {/* Upload */}
              {level === 'files' && (
                <>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                  <button
                    className="btn btn-primary h-9 py-0 px-4 text-sm whitespace-nowrap"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <span className="spinner w-3 h-3 border-white/30 border-t-white mr-2" /> : <Upload size={14} className="mr-2" />}
                    Upload
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- MAIN CONTENT ROW --- */}
        <div
          className="flex-1 flex overflow-hidden relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-orange-500 border-dashed m-4 rounded-xl">
              <Upload size={48} className="text-orange-500 animate-bounce mb-4" />
              <p className="text-xl font-bold text-white">Drop files to upload</p>
              <p className="text-sm text-gray-300 mt-2">to {currentPrefix ? currentPrefix : 'root'}</p>
            </div>
          )}

          {/* --- FILE LIST --- */}
          <div
            className={`flex-1 overflow-auto bg-[#0a0a0a]/50 p-2 md:p-4 transition-all duration-300 ${showPreview ? 'mr-0 md:mr-80' : ''}`}
            onClick={() => {
              if (window.innerWidth < 768) setShowPreview(false); // Close preview on mobile when clicking bg
              setSelectedFile(null);
            }}
          >
            {loading && !buckets.length && !files.length && !folders.length ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
                <div className="spinner w-8 h-8" />
              </div>
            ) : level === 'buckets' ? (
              // --- BUCKETS GRID ---
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredBuckets.map(b => (
                  <div
                    key={b.Name}
                    onClick={() => handleOpenBucket(b.Name)}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-orange-500/30 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.01] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20"><HardDrive size={20} /></div>
                      <div className="overflow-hidden">
                        <h3 className="font-medium text-gray-200 group-hover:text-white truncate">{b.Name}</h3>
                        <p className="text-xs text-gray-500">{formatDate(b.CreationDate)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // --- FILES/FOLDERS ---
              <div className="flex flex-col h-full">
                {viewMode === 'list' && (
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-white/10 bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
                    <div className="col-span-8 md:col-span-6 flex items-center gap-1 cursor-pointer hover:text-gray-300" onClick={() => handleSort('name')}>
                      Name {sortField === 'name' && (sortDirection === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </div>
                    <div className="hidden md:flex col-span-2 justify-end cursor-pointer hover:text-gray-300" onClick={() => handleSort('size')}>
                      Size {sortField === 'size' && (sortDirection === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </div>
                    <div className="hidden md:flex col-span-3 justify-end cursor-pointer hover:text-gray-300" onClick={() => handleSort('date')}>
                      Date {sortField === 'date' && (sortDirection === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </div>
                    <div className="col-span-4 md:col-span-1"></div>
                  </div>
                )}

                <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" : "flex flex-col"}>

                  {/* Folders */}
                  {filteredFolders.map(folder => (
                    viewMode === 'list' ? (
                      <div
                        key={folder.Prefix}
                        onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder.Prefix); }}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: folder, type: 'folder' }); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleFolderDrop(e, folder.Prefix)}
                        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 items-center group transition-colors"
                      >
                        <div className="col-span-8 md:col-span-6 flex items-center gap-3">
                          <FolderIcon size={18} className="text-yellow-500/80 fill-yellow-500/20" />
                          <span className="text-sm font-medium text-gray-300 group-hover:text-white truncate">{folder.Name}</span>
                        </div>
                        <div className="hidden md:block col-span-2 text-right text-xs text-gray-600">-</div>
                        <div className="hidden md:block col-span-3 text-right text-xs text-gray-600">-</div>
                      </div>
                    ) : (
                      <div
                        key={folder.Prefix}
                        onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder.Prefix); }}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item: folder, type: 'folder' }); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleFolderDrop(e, folder.Prefix)}
                        className="bg-white/5 hover:bg-white/10 p-4 rounded-xl flex flex-col items-center text-center gap-2 cursor-pointer border border-transparent hover:border-white/10 transition-all"
                      >
                        <FolderIcon size={40} className="text-yellow-500/80 fill-yellow-500/20" />
                        <span className="text-xs text-gray-300 truncate w-full">{folder.Name}</span>
                      </div>
                    )
                  ))}

                  {/* Files */}
                  {filteredFiles.map(file => (
                    viewMode === 'list' ? (
                      <div
                        key={file.Key}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file)}
                        onClick={(e) => { e.stopPropagation(); handleFileClick(file); }}
                        className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-white/5 items-center group cursor-pointer transition-colors select-none
                                ${selectedFile?.Key === file.Key ? 'bg-orange-500/10 border-orange-500/20' : 'hover:bg-white/5'}
                             `}
                      >
                        <div className="col-span-8 md:col-span-6 flex items-center gap-3 overflow-hidden">
                          <div className="min-w-[24px]">{getFileIcon(file.Key)}</div>
                          <span className={`text-sm truncate ${selectedFile?.Key === file.Key ? 'text-orange-400' : 'text-gray-300'}`}>
                            {file.Key.split('/').pop()}
                          </span>
                        </div>
                        <div className="hidden md:block col-span-2 text-right text-xs text-gray-500 font-mono">{formatBytes(file.Size)}</div>
                        <div className="hidden md:block col-span-3 text-right text-xs text-gray-500 truncate">{formatDate(file.LastModified)}</div>
                        <div className="col-span-4 md:col-span-1 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, item: file, type: 'file' });
                            }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded text-gray-400"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={file.Key}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file)}
                        onClick={(e) => { e.stopPropagation(); handleFileClick(file); }}
                        className={`p-4 rounded-xl flex flex-col items-center text-center gap-3 cursor-pointer border transition-all relative select-none
                                ${selectedFile?.Key === file.Key
                            ? 'bg-orange-500/10 border-orange-500/40'
                            : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                          }
                             `}
                      >
                        <div className="w-12 h-12 flex items-center justify-center">
                          {getFileIcon(file.Key, 32)}
                        </div>
                        <div className="w-full overflow-hidden">
                          <p className={`text-xs truncate w-full ${selectedFile?.Key === file.Key ? 'text-orange-400' : 'text-gray-300'}`}>
                            {file.Key.split('/').pop()}
                          </p>
                          <p className="text-[10px] text-gray-600 mt-1">{formatBytes(file.Size)}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu({ x: e.clientX, y: e.clientY, item: file, type: 'file' });
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-black/50 rounded-full text-gray-400"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    )
                  ))}
                </div>

                {!folders.length && !files.length && !loading && (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-600 opacity-60">
                    <FolderOpen size={48} className="mb-4" />
                    <p>Empty Folder</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- PREVIEW SIDEBAR --- */}
          <div
            className={`fixed inset-y-0 right-0 w-full md:w-80 bg-[#0c0c0c] border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out z-30
               ${showPreview ? 'translate-x-0' : 'translate-x-full'}
            `}
          >
            {selectedFile ? (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <span className="font-medium text-sm text-gray-200">File Details</span>
                  <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {/* Preview Box */}
                  <div className="w-full aspect-square bg-black/20 rounded-lg border border-white/5 flex items-center justify-center mb-4 overflow-hidden relative group">
                    {['png', 'jpg', 'jpeg', 'webp', 'gif'].some(e => selectedFile.Key.toLowerCase().endsWith(e)) && previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center text-gray-600">
                        {getFileIcon(selectedFile.Key, 48)}
                        <span className="text-xs mt-2">No preview available</span>
                      </div>
                    )}
                    {/* Quick Action Overlay */}
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                      <button title="Open" onClick={() => window.open(previewUrl || '', '_blank')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ExternalLink size={16} /></button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Name</label>
                      <p className="text-sm text-gray-200 break-words font-mono mt-1">{selectedFile.Key.split('/').pop()}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Full Path</label>
                      <p className="text-xs text-gray-400 break-words font-mono mt-1 select-all">{selectedFile.Key}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Size</label>
                        <p className="text-sm text-gray-300 mt-1">{formatBytes(selectedFile.Size)}</p>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Modified</label>
                        <p className="text-sm text-gray-300 mt-1">{formatDate(selectedFile.LastModified)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/10 grid grid-cols-2 gap-2 bg-white/5">
                  <button
                    onClick={() => handlePublicLink(selectedFile.Key)}
                    className="col-span-2 btn btn-ghost justify-center text-xs bg-white/5 hover:bg-white/10"
                  >
                    <Copy size={14} /> Copy Public Link
                  </button>
                  <button
                    onClick={() => {
                      const url = getPublicUrl(selectedFile.Key, currentBucket);
                      if (url) window.open(url, '_blank');
                    }}
                    className="col-span-2 btn btn-ghost justify-center text-xs border border-white/10"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button
                    onClick={() => handleDelete(selectedFile.Key)}
                    className="col-span-2 btn btn-danger justify-center text-xs mt-2"
                  >
                    <Trash2 size={14} /> Delete File
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600">
                <p>Select a file to view details</p>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-2 border-t border-white/10 bg-black/40 text-[10px] text-gray-600 text-center shrink-0">
          R2 Explorer Pro • {files.length} Files • {folders.length} Folders
        </div>
      </div>

      {/* --- CONTEXT MENU --- */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[160px] bg-[#0c0c0c] border border-white/10 rounded-lg shadow-2xl py-1 text-sm text-gray-300 animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
          style={{ top: contextMenu.y, left: Math.min(contextMenu.x, window.innerWidth - 170) }}
        >
          {contextMenu.type === 'file' ? (
            <>
              <button className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-2 hover:text-white" onClick={() => { handlePublicLink((contextMenu.item as R2Object).Key); setContextMenu(null); }}>
                <Copy size={14} /> Copy Link
              </button>
              <button className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-2 hover:text-white" onClick={() => { handleDownload((contextMenu.item as R2Object).Key); setContextMenu(null); }}>
                <Download size={14} /> Download
              </button>
              <div className="h-[1px] bg-white/10 my-1"></div>

              <button
                className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-2 hover:text-white"
                onClick={() => { setClipboard({ item: contextMenu.item as R2Object, action: 'copy' }); setContextMenu(null); toast.info("Copied to clipboard"); }}
              >
                <Copy size={14} /> Copy to...
              </button>
              <button
                className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-2 hover:text-white"
                onClick={() => { setClipboard({ item: contextMenu.item as R2Object, action: 'move' }); setContextMenu(null); toast.info("Cut to clipboard"); }}
              >
                <Scissors size={14} /> Move to...
              </button>

              <div className="h-[1px] bg-white/10 my-1"></div>
              <button className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-400 hover:text-red-500 flex items-center gap-2" onClick={() => { handleDelete((contextMenu.item as R2Object).Key); setContextMenu(null); }}>
                <Trash2 size={14} /> Delete
              </button>
            </>
          ) : (
            <>
              <button className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-2 hover:text-white" onClick={() => { handleOpenFolder((contextMenu.item as R2Folder).Prefix); setContextMenu(null); }}>
                <FolderOpen size={14} /> Open
              </button>
            </>
          )}
        </div>
      )}

      {/* Background Context Menu (Paste) */}
      <div
        className="fixed inset-0 z-0"
        onContextMenu={(e) => {
          if (clipboard) {
            e.preventDefault();
            // We reuse text menu for simpler logic or create new. 
            // Ideally we just want a "Paste" option if clipboard full
          }
        }}
        style={{ pointerEvents: 'none' }}
      >
        {/* Drop zone visualizer logic handled in main DragOver */}
      </div>

      {/* Floating Paste Button if Clipboard has items */}
      {clipboard && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-[#111] border border-white/10 rounded-full shadow-2xl flex items-center p-1 pl-4 pr-1 gap-3">
            <span className="text-xs text-gray-300">
              {clipboard.action === 'move' ? 'Move' : 'Copy'} <b>{clipboard.item.Key.split('/').pop()}</b> here?
            </span>
            <div className="flex gap-1">
              <button
                onClick={handlePaste}
                className="p-2 rounded-full bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center gap-2 px-3"
              >
                <ClipboardPaste size={14} /> Paste
              </button>
              <button
                onClick={() => setClipboard(null)}
                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
