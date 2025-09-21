import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { GridState, CellPosition } from './types';
import { 
    PlusIcon, UploadIcon, SparklesIcon, XIcon, DownloadIcon, CropIcon, CheckIcon, LoaderIcon, 
    WandIcon, BookOpenIcon, SettingsIcon, TrashIcon, EditIcon, FlipHorizontalIcon, FlipVerticalIcon, EyedropperIcon
} from './components/icons';
import { enhancePrompt, generateImage, generateVideoFromImage } from './services/geminiService';
import { useImageProcessor } from './hooks/useImageProcessor';
import JSZip from 'jszip';

const createEmptyGrid = (rows: number, cols: number): GridState => {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
};

// --- Child Components defined outside App to prevent re-creation on re-render ---

interface GridControlsProps {
    rows: number;
    cols: number;
    setRows: (r: number) => void;
    setCols: (c: number) => void;
    onSettingsClick: () => void;
}

const GridControls: React.FC<GridControlsProps> = ({ rows, cols, setRows, setCols, onSettingsClick }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg flex items-center justify-center gap-4 sm:gap-6 mb-8">
        <div className="flex items-center gap-2">
            <label htmlFor="rows" className="text-gray-300 font-medium">Rows:</label>
            <input
                type="number"
                id="rows"
                value={rows}
                onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10)))}
                className="bg-gray-700 text-white w-20 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                min="1"
                max="10"
            />
        </div>
        <div className="flex items-center gap-2">
            <label htmlFor="cols" className="text-gray-300 font-medium">Columns:</label>
            <input
                type="number"
                id="cols"
                value={cols}
                onChange={(e) => setCols(Math.max(1, parseInt(e.target.value, 10)))}
                className="bg-gray-700 text-white w-20 p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                min="1"
                max="10"
            />
        </div>
        <button onClick={onSettingsClick} className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors" aria-label="Open settings">
            <SettingsIcon className="w-6 h-6 text-gray-300" />
        </button>
    </div>
);

interface GridCellProps {
    imageSrc: string | null;
    onClick: () => void;
    onClear: () => void;
}
const GridCell: React.FC<GridCellProps> = ({ imageSrc, onClick, onClear }) => {
    return (
        <div
            className="relative aspect-auto bg-gray-800/50 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center overflow-hidden transition-all duration-300 group"
            style={{ aspectRatio: 'auto' }}
        >
            {imageSrc ? (
              <>
                <img src={imageSrc} alt="cell content" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button onClick={onClick} className="text-white p-3 bg-white/10 rounded-full hover:bg-white/20" aria-label="Edit image">
                        <EditIcon />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-white p-3 bg-white/10 rounded-full hover:bg-white/20" aria-label="Clear image">
                        <TrashIcon />
                    </button>
                </div>
              </>
            ) : (
                <button onClick={onClick} className="w-full h-full text-gray-500 group-hover:text-indigo-400 group-hover:bg-gray-800/80 transition-colors flex items-center justify-center" aria-label="Add image">
                    <PlusIcon className="w-12 h-12" />
                </button>
            )}
        </div>
    );
};

// Main App Component
const App: React.FC = () => {
    const [rows, setRows] = useState(2);
    const [cols, setCols] = useState(4);
    const [gridImages, setGridImages] = useState<GridState>(() => createEmptyGrid(2, 4));
    const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [isCollectionOpen, setIsCollectionOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [imageToProcess, setImageToProcess] = useState<string | null>(null);
    const [collection, setCollection] = useState<string[]>([]);
    const [mixedImage, setMixedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [finalWidth, setFinalWidth] = useState(3000);
    const [finalHeight, setFinalHeight] = useState(1695);
    const [padding, setPadding] = useState(10);
    const [mixBackgroundColor, setMixBackgroundColor] = useState('#111827');
    
    const [videoPrompt, setVideoPrompt] = useState('');
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoGenerationProgress, setVideoGenerationProgress] = useState('');
    const [videoModel, setVideoModel] = useState('veo-2.0-generate-001');
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [importedVideoUrl, setImportedVideoUrl] = useState<string | null>(null);

    const { mixImages, autoCrop, letterboxImage, flipImage, manualCrop } = useImageProcessor();
    const masterpieceRef = useRef<HTMLDivElement>(null);
    const videoEditorRef = useRef<HTMLDivElement>(null);

    const cellAspectRatio = useMemo(() => {
        const totalPaddingX = padding * (cols + 1);
        const totalPaddingY = padding * (rows + 1);
        const contentWidth = finalWidth - totalPaddingX;
        const contentHeight = finalHeight - totalPaddingY;
        if (contentWidth <= 0 || contentHeight <= 0) return 1;
        const cellWidth = contentWidth / cols;
        const cellHeight = contentHeight / rows;
        return cellWidth / cellHeight;
    }, [cols, rows, finalWidth, finalHeight, padding]);

    const handleRowsChange = (newRows: number) => {
        if(isNaN(newRows) || newRows < 1) return;
        const newGrid = createEmptyGrid(newRows, cols);
        for (let r = 0; r < Math.min(rows, newRows); r++) {
            for (let c = 0; c < cols; c++) {
                newGrid[r][c] = gridImages[r][c];
            }
        }
        setRows(newRows);
        setGridImages(newGrid);
        setMixedImage(null);
    };

    const handleColsChange = (newCols: number) => {
        if(isNaN(newCols) || newCols < 1) return;
        const newGrid = createEmptyGrid(rows, newCols);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < Math.min(cols, newCols); c++) {
                newGrid[r][c] = gridImages[r][c];
            }
        }
        setCols(newCols);
        setGridImages(newGrid);
        setMixedImage(null);
    };

    const handleCellClick = (row: number, col: number) => {
        setActiveCell({ row, col });
        const existingImage = gridImages[row][col];
        if (existingImage) {
            // Allow re-editing
            setImageToProcess(existingImage);
            setIsCropModalOpen(true);
        } else {
            setIsAddModalOpen(true);
        }
    };
    
    const handleClearCell = (row: number, col: number) => {
        const newGrid = [...gridImages.map(r => [...r])];
        newGrid[row][col] = null;
        setGridImages(newGrid);
    };
    
    const handleSingleImageSelected = async (dataUrl: string) => {
        setIsAddModalOpen(false);
        setIsCollectionOpen(false);
        setImageToProcess(dataUrl);
        setIsCropModalOpen(true);
    };

    const handleBulkImagesSelected = async (dataUrls: string[]) => {
        setIsLoading(true);
        const newGrid = [...gridImages.map(row => [...row])];
        const emptyCells: CellPosition[] = [];
        newGrid.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell === null) emptyCells.push({ row: r, col: c });
            });
        });

        if (emptyCells.length === 0) {
            setIsLoading(false);
            return;
        }

        const newCollection = [...collection];
        for (let i = 0; i < Math.min(dataUrls.length, emptyCells.length); i++) {
            try {
                const cell = emptyCells[i];
                const finalImage = await letterboxImage(dataUrls[i], cellAspectRatio, '#FFFFFF');
                newGrid[cell.row][cell.col] = finalImage;
                if (!newCollection.includes(finalImage)) newCollection.push(finalImage);
            } catch (error) {
                console.error(`Error processing image ${i + 1}:`, error);
            }
        }
        
        setGridImages(newGrid);
        setCollection(newCollection);
        setIsLoading(false);
        setIsAddModalOpen(false);
    };

    const handleImageSelectionEvent = (dataUrls: string[]) => {
        if (dataUrls.length === 1) {
            handleSingleImageSelected(dataUrls[0]);
        } else if (dataUrls.length > 1) {
            handleBulkImagesSelected(dataUrls);
        }
    };
    
    const handleImageCropped = (croppedDataUrl: string) => {
        if (activeCell) {
            const newGrid = [...gridImages.map(r => [...r])];
            newGrid[activeCell.row][activeCell.col] = croppedDataUrl;
            setGridImages(newGrid);

            if (!collection.includes(croppedDataUrl)) {
                setCollection(prev => [croppedDataUrl, ...prev]);
            }
        }
        setIsCropModalOpen(false);
        setImageToProcess(null);
        setActiveCell(null);
    };

    const handleMixClick = async () => {
        setIsLoading(true);
        setGeneratedVideoUrl(null);
        setImportedVideoUrl(null);
        setVideoPrompt('');
        try {
            const result = await mixImages(gridImages, cols, rows, finalWidth, finalHeight, padding, mixBackgroundColor);
            setMixedImage(result);
            setTimeout(() => {
                masterpieceRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (error) {
            console.error("Error mixing images:", error);
            alert("Failed to mix images.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleManualImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setMixedImage(dataUrl);
            setGeneratedVideoUrl(null);
            setImportedVideoUrl(null);
            setVideoPrompt('');
            setTimeout(() => {
                masterpieceRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        };
        reader.onerror = (error) => {
            console.error("Error reading file:", error);
            alert("Failed to read the selected file.");
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset file input
    };
    
    const handleManualVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        setImportedVideoUrl(url);
        setMixedImage(null);
        setGeneratedVideoUrl(null);
        
        setTimeout(() => {
            videoEditorRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);

        e.target.value = ''; // Reset file input
    };
    
    const handleGenerateVideo = async () => {
        if (!mixedImage || !videoPrompt) return;
        
        setIsGeneratingVideo(true);
        setGeneratedVideoUrl(null);
        setVideoGenerationProgress('');
    
        try {
            const mimeType = mixedImage.match(/data:(image\/\w+);/)?.[1] || 'image/png';
            
            const videoUrl = await generateVideoFromImage(
                videoPrompt,
                { base64: mixedImage, mimeType: mimeType },
                videoModel,
                (message) => setVideoGenerationProgress(message)
            );
            
            setGeneratedVideoUrl(videoUrl);
        } catch (error) {
            console.error("Error generating video:", error);
            alert(`Failed to generate video. ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsGeneratingVideo(false);
            setVideoGenerationProgress('');
        }
    };

    const isGridFull = useMemo(() => gridImages.flat().every(cell => cell !== null), [gridImages]);

    const downloadImage = (dataUrl: string, filename: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500 mb-2">
                        Gemini Image Collage Mixer
                    </h1>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        Create your masterpiece. Define your grid, generate AI images for each cell, and mix them into a stunning collage.
                    </p>
                </header>

                <main>
                    <GridControls rows={rows} cols={cols} setRows={handleRowsChange} setCols={handleColsChange} onSettingsClick={() => setIsSettingsOpen(true)} />
                    
                    <div 
                      className="grid gap-4 mb-8"
                      style={{
                          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                      }}
                    >
                      {gridImages.map((rowItems, r) =>
                          rowItems.map((img, c) => (
                              <div key={`${r}-${c}`} style={{ aspectRatio: `${cellAspectRatio}`}}>
                                  <GridCell 
                                      imageSrc={img}
                                      onClick={() => handleCellClick(r, c)}
                                      onClear={() => handleClearCell(r, c)}
                                  />
                              </div>
                          ))
                      )}
                    </div>

                    <div className="text-center mb-8 flex flex-wrap items-center justify-center gap-4">
                        <button
                            onClick={handleMixClick}
                            disabled={!isGridFull || isLoading}
                            className="bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-all duration-300 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading && !mixedImage ? <LoaderIcon /> : <SparklesIcon />}
                            {isLoading && !mixedImage ? 'Mixing...' : 'Mix Collage'}
                        </button>
                        
                        <input type="file" accept="image/*" id="manual-image-animate" className="hidden" onChange={handleManualImageUpload} />
                        <label htmlFor="manual-image-animate" className="cursor-pointer bg-gray-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-all duration-300 hover:bg-gray-600 flex items-center justify-center gap-2">
                            <UploadIcon />
                            Animate Image
                        </label>
                        
                        <input type="file" accept="video/*" id="manual-video-import" className="hidden" onChange={handleManualVideoUpload} />
                        <label htmlFor="manual-video-import" className="cursor-pointer bg-gray-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-all duration-300 hover:bg-gray-600 flex items-center justify-center gap-2">
                            <UploadIcon />
                            Import Video
                        </label>
                    </div>

                    {mixedImage && (
                        <div ref={masterpieceRef} className="mt-8 p-4 bg-gray-800/50 rounded-lg">
                            <h2 className="text-2xl font-bold text-center mb-4">Your Masterpiece</h2>
                            <img src={mixedImage} alt="Mixed collage" className="w-full h-auto rounded-lg shadow-2xl" style={{aspectRatio: `${finalWidth}/${finalHeight}`}} />
                            <div className="text-center mt-4">
                                <button
                                    onClick={() => downloadImage(mixedImage, 'collage-masterpiece.png')}
                                    className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-all duration-300 hover:bg-green-500 flex items-center justify-center gap-2 mx-auto"
                                >
                                    <DownloadIcon />
                                    Download Image
                                </button>
                            </div>
                            
                            <div className="mt-6 pt-6 border-t border-gray-700">
                                <h3 className="text-xl font-bold text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                                    Animate Your Image
                                </h3>
                                <div className="max-w-xl mx-auto">
                                    <textarea
                                        value={videoPrompt}
                                        onChange={(e) => setVideoPrompt(e.target.value)}
                                        placeholder="Describe how you want to animate this image. e.g., 'A slow zoom in on the center, with sparkling lights appearing.'"
                                        className="w-full bg-gray-700 p-3 rounded-md border border-gray-600 h-24 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        disabled={isGeneratingVideo}
                                        aria-label="Video animation prompt"
                                    />
                                    <div className="flex items-center gap-4 mt-4">
                                        <select
                                            value={videoModel}
                                            onChange={(e) => setVideoModel(e.target.value)}
                                            className="bg-gray-700 text-white p-3 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            disabled={isGeneratingVideo}
                                        >
                                            <option value="veo-2.0-generate-001">VEO 2</option>
                                            <option value="veo-3" disabled>VEO 3 (coming soon)</option>
                                        </select>
                                        <button
                                            onClick={handleGenerateVideo}
                                            disabled={!videoPrompt.trim() || isGeneratingVideo}
                                            className="w-full bg-purple-600 text-white font-bold py-3 rounded-lg shadow-lg transition-all duration-300 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isGeneratingVideo ? <LoaderIcon /> : <WandIcon />}
                                            {isGeneratingVideo ? 'Generating...' : 'Generate Video'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {isGeneratingVideo && (
                                <div className="text-center mt-4 text-gray-400">
                                    <p>{videoGenerationProgress}</p>
                                </div>
                            )}

                            {generatedVideoUrl && !isGeneratingVideo && (
                                <div className="mt-6">
                                    <h3 className="text-xl font-bold text-center mb-4">Edit & Export Your Video</h3>
                                    <VideoTrimmer key={generatedVideoUrl} videoUrl={generatedVideoUrl} />
                                </div>
                            )}
                        </div>
                    )}
                    
                    {importedVideoUrl && (
                        <div ref={videoEditorRef} className="mt-8 p-4 bg-gray-800/50 rounded-lg">
                            <h2 className="text-2xl font-bold text-center mb-4">Edit & Export Imported Video</h2>
                             <VideoTrimmer key={importedVideoUrl} videoUrl={importedVideoUrl} />
                        </div>
                    )}

                </main>
            </div>

            {isAddModalOpen && activeCell && (
                <AddImageDialog
                    onClose={() => setIsAddModalOpen(false)}
                    onImagesSelected={handleImageSelectionEvent}
                    addToCollection={(img) => setCollection(prev => [img, ...prev])}
                    cellAspectRatio={cellAspectRatio}
                    onOpenCollection={() => { setIsAddModalOpen(false); setIsCollectionOpen(true); }}
                />
            )}

            {isCropModalOpen && imageToProcess && (
                <ImageCropper
                    imageSrc={imageToProcess}
                    aspectRatio={cellAspectRatio}
                    onClose={() => setIsCropModalOpen(false)}
                    onCrop={handleImageCropped}
                    processor={{ mixImages, autoCrop, letterboxImage, flipImage, manualCrop }}
                />
            )}
            
            {isCollectionOpen && (
                <CollectionDialog 
                    collection={collection}
                    onClose={() => setIsCollectionOpen(false)}
                    onImageSelect={handleSingleImageSelected}
                />
            )}
            {isSettingsOpen && (
                <SettingsDialog
                    onClose={() => setIsSettingsOpen(false)}
                    width={finalWidth}
                    height={finalHeight}
                    padding={padding}
                    backgroundColor={mixBackgroundColor}
                    onSave={(w, h, p, c) => { 
                        setFinalWidth(w); 
                        setFinalHeight(h); 
                        setPadding(p);
                        setMixBackgroundColor(c);
                    }}
                />
            )}
        </div>
    );
};


// --- Video Trimmer Component ---
interface VideoTrimmerProps {
    videoUrl: string;
}
const VideoTrimmer: React.FC<VideoTrimmerProps> = ({ videoUrl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [duration, setDuration] = useState(0);
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const [startTimeInput, setStartTimeInput] = useState('00:00.000');
    const [endTimeInput, setEndTimeInput] = useState('00:00.000');
    const [exportFps, setExportFps] = useState(30);

    const formatTime = useCallback((time: number): string => {
        if (isNaN(time) || time < 0) return '00:00.000';
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.floor((time * 1000) % 1000);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }, []);

    const parseTime = (timeStr: string): number => {
        const parts = timeStr.split(':');
        if (parts.length !== 2) return NaN;
        const [minutesStr, secondsAndMsStr] = parts;
        
        const secondsParts = secondsAndMsStr.split('.');
        if (secondsParts.length < 1 || secondsParts.length > 2) return NaN;
        const [secondsStr, msStr] = secondsParts;
    
        const minutes = parseInt(minutesStr, 10);
        const seconds = parseInt(secondsStr, 10);
        const milliseconds = msStr ? parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) : 0;
    
        if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) return NaN;
        
        return minutes * 60 + seconds + milliseconds / 1000;
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const handleLoadedMetadata = () => {
            const videoDuration = video.duration;
            if (videoDuration && isFinite(videoDuration)) {
                setDuration(videoDuration);
                setStartTime(0);
                setEndTime(videoDuration);
            }
        };
        video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        if (video.readyState >= 1) handleLoadedMetadata(); // HAVE_METADATA
        return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }, [videoUrl]);
    
    useEffect(() => {
        setStartTimeInput(formatTime(startTime));
    }, [startTime, formatTime]);

    useEffect(() => {
        setEndTimeInput(formatTime(endTime));
    }, [endTime, formatTime]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || duration === 0) return;
        const handleTimeUpdate = () => {
            if (video.currentTime < startTime || video.currentTime >= endTime) {
                video.currentTime = startTime;
            }
            setCurrentTime(video.currentTime);
        };
        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }, [startTime, endTime, duration]);
    
    useEffect(() => {
        return () => {
            if (videoUrl && videoUrl.startsWith('blob:')) {
                URL.revokeObjectURL(videoUrl);
            }
        }
    }, [videoUrl]);

    const handleExportFrames = async () => {
        const video = videoRef.current;
        if (!video || isExporting) return;

        const frameRate = exportFps;
        if (!frameRate || frameRate <= 0) {
            alert("Frames per second must be a positive number.");
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            if (!ctx) throw new Error("Could not get canvas context");
            
            const zip = new JSZip();
            const totalFrames = Math.floor((endTime - startTime) * frameRate);
            let frameCount = 0;
            
            video.pause();

            for (let time = startTime; time <= endTime; time += 1 / frameRate) {
                video.currentTime = time;
                await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    zip.file(`frame_${String(frameCount).padStart(5, '0')}.png`, blob);
                }
                
                frameCount++;
                if (totalFrames > 0) {
                   setExportProgress((frameCount / totalFrames) * 100);
                }
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = 'video-frames.zip';
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Error exporting frames:", error);
            alert("Failed to export frames.");
        } finally {
            setIsExporting(false);
            if (video) video.play();
        }
    };

    const handleTimelineInteraction = (e: React.MouseEvent<HTMLDivElement>, thumb: 'start' | 'end' | 'playhead') => {
        e.preventDefault();
        const timeline = timelineRef.current;
        if (!timeline || duration === 0) return;

        const rect = timeline.getBoundingClientRect();
        
        const updatePosition = (clientX: number) => {
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const time = pos * duration;
            if (thumb === 'start') {
                setStartTime(Math.min(time, endTime - 0.1));
            } else if (thumb === 'end') {
                setEndTime(Math.max(time, startTime + 0.1));
            } else {
                if (videoRef.current) videoRef.current.currentTime = time;
            }
        };

        updatePosition(e.clientX);

        const handleMouseMove = (moveEvent: MouseEvent) => updatePosition(moveEvent.clientX);
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleTimeInputBlur = (type: 'start' | 'end') => {
        const input = type === 'start' ? startTimeInput : endTimeInput;
        const parsedTime = parseTime(input);
        if (!isNaN(parsedTime) && isFinite(parsedTime)) {
            if (type === 'start') {
                setStartTime(Math.max(0, Math.min(parsedTime, endTime)));
            } else {
                setEndTime(Math.min(duration, Math.max(parsedTime, startTime)));
            }
        } else {
            if (type === 'start') setStartTimeInput(formatTime(startTime));
            else setEndTimeInput(formatTime(endTime));
        }
    };
    
    const handleTimeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'start' | 'end') => {
        if (e.key === 'Enter') {
            handleTimeInputBlur(type);
            e.currentTarget.blur();
        }
    };

    const startPercent = duration > 0 ? (startTime / duration) * 100 : 0;
    const endPercent = duration > 0 ? (endTime / duration) * 100 : 0;
    const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const rangeWidth = duration > 0 ? ((endTime - startTime) / duration) * 100 : 0;

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg">
            <video ref={videoRef} src={videoUrl} controls autoPlay loop className="w-full h-auto rounded-lg shadow-2xl" muted playsInline/>
            <div className="mt-4 space-y-3">
                <div ref={timelineRef} onMouseDown={(e) => handleTimelineInteraction(e, 'playhead')} className="relative h-4 bg-gray-700 rounded-full cursor-pointer touch-none">
                    <div className="absolute h-full bg-indigo-400/50 rounded-full" style={{ left: `${startPercent}%`, width: `${rangeWidth}%` }}></div>
                    <div className="absolute h-full top-0" style={{ left: `${currentPercent}%`}}>
                        <div className="w-1 h-full bg-red-500"></div>
                    </div>
                    <div onMouseDown={(e) => { e.stopPropagation(); handleTimelineInteraction(e, 'start'); }} className="absolute -top-1 w-6 h-6 rounded-full bg-indigo-500 border-2 border-white cursor-ew-resize" style={{ left: `${startPercent}%`, transform: 'translateX(-50%)' }}></div>
                    <div onMouseDown={(e) => { e.stopPropagation(); handleTimelineInteraction(e, 'end'); }} className="absolute -top-1 w-6 h-6 rounded-full bg-indigo-500 border-2 border-white cursor-ew-resize" style={{ left: `${endPercent}%`, transform: 'translateX(-50%)' }}></div>
                </div>
                <div className="flex justify-between items-center gap-4 text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                        <label htmlFor="start-time">Start:</label>
                        <input type="text" id="start-time" value={startTimeInput} onChange={e => setStartTimeInput(e.target.value)} onBlur={() => handleTimeInputBlur('start')} onKeyDown={e => handleTimeInputKeyDown(e, 'start')} className="w-24 bg-gray-700 p-1 rounded text-center font-mono"/>
                    </div>
                     <div className="font-mono text-lg">{formatTime(currentTime)} / {formatTime(duration)}</div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="end-time">End:</label>
                        <input type="text" id="end-time" value={endTimeInput} onChange={e => setEndTimeInput(e.target.value)} onBlur={() => handleTimeInputBlur('end')} onKeyDown={e => handleTimeInputKeyDown(e, 'end')} className="w-24 bg-gray-700 p-1 rounded text-center font-mono"/>
                    </div>
                </div>
                <div className="flex justify-center items-center gap-2 text-sm">
                    <label htmlFor="fps-input">Export FPS:</label>
                    <input type="number" id="fps-input" value={exportFps} onChange={e => setExportFps(Math.max(0, parseInt(e.target.value, 10)) || 0)} className="w-20 bg-gray-700 p-1 rounded text-center" min="1" />
                </div>
            </div>
            {isExporting && (
                <div className="mt-4">
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                         <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${exportProgress}%` }}></div>
                    </div>
                    <p className="text-center text-sm text-gray-400 mt-1">Exporting frames... {Math.round(exportProgress)}%</p>
                </div>
            )}
            <div className="text-center mt-4 flex gap-4 justify-center flex-wrap">
                 <a href={videoUrl} download="animated-collage.mp4" className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-all duration-300 hover:bg-green-500 inline-flex items-center justify-center gap-2">
                    <DownloadIcon />
                    Download Video
                </a>
                <button onClick={handleExportFrames} disabled={isExporting} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg transition-all duration-300 hover:bg-blue-500 disabled:bg-gray-600 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                    {isExporting ? <LoaderIcon /> : <CropIcon />}
                    {isExporting ? 'Exporting...' : 'Cut & Export Frames'}
                </button>
            </div>
        </div>
    );
};


// --- Modal Components ---

interface AddImageDialogProps {
    onClose: () => void;
    onImagesSelected: (dataUrls: string[]) => void;
    addToCollection: (dataUrl: string) => void;
    cellAspectRatio: number;
    onOpenCollection: () => void;
}
const AddImageDialog: React.FC<AddImageDialogProps> = ({ onClose, onImagesSelected, addToCollection, cellAspectRatio, onOpenCollection }) => {
    const [mode, setMode] = useState<'import' | 'generate'>('import');
    const [prompt, setPrompt] = useState('');
    const [referenceImage, setReferenceImage] = useState<{ base64: string; mimeType: string } | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const filePromises = Array.from(files).map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) resolve(event.target.result as string);
                    else reject(new Error("FileReader event target is null"));
                };
                reader.onerror = () => reject(reader.error || new Error(`Failed to read file: ${file.name}`));
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises)
            .then(dataUrls => { if (dataUrls.length > 0) onImagesSelected(dataUrls); })
            .catch(error => {
                console.error("Error reading files:", error);
                alert(`An error occurred while reading files: ${error.message}`);
            });
    };
    
    const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    const base64 = event.target.result as string;
                    setReferenceImage({ base64, mimeType: file.type });
                    addToCollection(base64);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEnhancePrompt = async () => {
        if (!prompt) return;
        setIsEnhancing(true);
        try {
            const enhanced = await enhancePrompt(prompt);
            setPrompt(enhanced);
        } catch (error) {
            console.error("Failed to enhance prompt", error);
        } finally {
            setIsEnhancing(false);
        }
    };
    
    const handleGenerate = async () => {
        if (!prompt) return;
        setIsGenerating(true);
        try {
            const supportedRatios = { '1:1': 1, '3:4': 0.75, '4:3': 1.33, '9:16': 0.56, '16:9': 1.77 };
            const closestRatio = Object.keys(supportedRatios).reduce((prev, curr) => 
                Math.abs(supportedRatios[curr as keyof typeof supportedRatios] - cellAspectRatio) < Math.abs(supportedRatios[prev as keyof typeof supportedRatios] - cellAspectRatio) ? curr : prev
            ) as '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

            const generatedImg = await generateImage(prompt, closestRatio, referenceImage ?? undefined);
            onImagesSelected([generatedImg]);
        } catch (error) {
            alert('Failed to generate image. Check the console for details.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl text-white relative animate-fade-in-up">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"><XIcon /></button>
                <div className="p-6">
                    <div className="flex border-b border-gray-700 mb-4">
                        <button onClick={() => setMode('import')} className={`py-2 px-4 text-lg font-semibold ${mode === 'import' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}>Import</button>
                        <button onClick={() => setMode('generate')} className={`py-2 px-4 text-lg font-semibold ${mode === 'generate' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}>Generate</button>
                    </div>

                    {mode === 'import' && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold">Upload Image(s)</h3>
                            <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                            <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2 bg-gray-700 p-8 rounded-lg border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors">
                                <UploadIcon className="w-10 h-10 text-gray-400" />
                                <span className="text-gray-300">Click to upload or drag & drop</span>
                                <span className="text-gray-500 text-sm">Select multiple files to fill empty cells</span>
                            </button>
                            <div className="flex items-center gap-2">
                                <hr className="flex-grow border-gray-600"/> <span className="text-gray-500">OR</span> <hr className="flex-grow border-gray-600"/>
                            </div>
                            <button onClick={onOpenCollection} className="w-full flex items-center justify-center gap-2 bg-gray-700 p-4 rounded-lg border border-gray-600 hover:border-indigo-500 transition-colors">
                                <BookOpenIcon className="w-6 h-6 text-gray-400" />
                                <span className="text-gray-300 font-semibold">Choose from Collection</span>
                            </button>
                        </div>
                    )}
                    
                    {mode === 'generate' && (
                         <div className="space-y-4">
                            <h3 className="text-xl font-bold">Generate Image with AI</h3>
                            <div>
                                <textarea 
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="e.g., A majestic cat astronaut floating in space, vibrant nebula background, digital art"
                                    className="w-full bg-gray-700 p-2 rounded-md border border-gray-600 h-24 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                                 <button onClick={handleEnhancePrompt} disabled={isEnhancing || !prompt} className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                                    {isEnhancing ? <LoaderIcon className="w-4 h-4"/> : <WandIcon className="w-4 h-4" />}
                                    {isEnhancing ? 'Enhancing...' : 'Enhance Prompt'}
                                </button>
                            </div>

                            <div className="flex items-center gap-4">
                               <input type="file" accept="image/*" onChange={handleRefFileChange} id="ref-image-upload" className="hidden" />
                                <label htmlFor="ref-image-upload" className="flex-1 cursor-pointer text-center bg-gray-700 p-3 rounded-md border border-gray-600 hover:border-indigo-500 transition-colors">
                                    {referenceImage ? 'Change Reference Image' : 'Add Reference Image (Optional)'}
                                </label>
                                {referenceImage && <img src={referenceImage.base64} alt="reference" className="w-16 h-16 rounded-md object-cover" />}
                            </div>

                            <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="w-full bg-indigo-600 font-bold py-3 rounded-lg hover:bg-indigo-500 transition-colors disabled:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-2">
                                {isGenerating ? <LoaderIcon /> : <SparklesIcon />}
                                {isGenerating ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface ImageCropperProps {
    imageSrc: string;
    aspectRatio: number;
    onClose: () => void;
    onCrop: (dataUrl: string) => void;
    processor: ReturnType<typeof useImageProcessor>;
}

const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, aspectRatio, onClose, onCrop, processor }) => {
    const [mode, setMode] = useState<'auto' | 'manual'>('auto');
    const [isLoading, setIsLoading] = useState(false);
    const [currentImage, setCurrentImage] = useState(imageSrc);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
    
    const [bgColor, setBgColor] = useState('#FFFFFF');
    const [cropColor, setCropColor] = useState('#FFFFFF');
    const [isEyedropperActive, setIsEyedropperActive] = useState(false);

    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<{ type: string, startX: number, startY: number, startBox: typeof cropBox } | null>(null);

    useEffect(() => {
        const img = new Image();
        img.src = currentImage;
        img.onload = () => {
            setImageSize({ width: img.width, height: img.height });
            setCropBox({ x: 0, y: 0, width: img.width, height: img.height });
        };
    }, [currentImage]);
    
    const handleAction = async (action: (img: string) => Promise<string>) => {
        if (!currentImage) return;
        setIsLoading(true);
        try {
            const result = await action(currentImage);
            setCurrentImage(result);
        } catch (err) {
            console.error("Image processing action failed:", err);
            alert("An error occurred during image processing.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFlip = (dir: 'horizontal' | 'vertical') => handleAction(img => processor.flipImage(img, dir));
    const handleAutoCrop = (color?: string) => handleAction(img => processor.autoCrop(img, color));
    
    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            let finalImage = currentImage;
            if (mode === 'manual') {
                const finalCropBox = {
                    x: Math.round(cropBox.x),
                    y: Math.round(cropBox.y),
                    width: Math.round(cropBox.width),
                    height: Math.round(cropBox.height),
                };
                if (finalCropBox.width > 0 && finalCropBox.height > 0) {
                    finalImage = await processor.manualCrop(currentImage, finalCropBox);
                }
            }
            const letterboxedImage = await processor.letterboxImage(finalImage, aspectRatio, bgColor);
            onCrop(letterboxedImage);
        } catch(err) {
            console.error("Failed to finalize image:", err);
            alert("Failed to finalize image.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEyedropperClick = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!isEyedropperActive || !imageRef.current) return;
        const canvas = document.createElement('canvas');
        const img = imageRef.current;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        const rect = img.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = img.naturalWidth / rect.width;
        const scaleY = img.naturalHeight / rect.height;
        
        const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
        const hex = `#${("000000" + ((pixel[0] << 16) | (pixel[1] << 8) | pixel[2]).toString(16)).slice(-6)}`;
        setCropColor(hex);
        setIsEyedropperActive(false);
    };

    const handleBgEyedropper = async () => {
        if (!('EyeDropper' in window)) {
            alert("Your browser doesn't support the Eyedropper API.");
            return;
        }
        try {
            // @ts-ignore - EyeDropper is not in default TS lib yet
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            setBgColor(result.sRGBHex);
        } catch (e) {
            console.log("Eyedropper was canceled.");
        }
    };

    // Manual Crop Handlers
    const getCoords = (e: MouseEvent | TouchEvent) => 'touches' in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

    const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent, type: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!containerRef.current) return;
        const { x, y } = getCoords(e.nativeEvent);
        interactionRef.current = { type, startX: x, startY: y, startBox: { ...cropBox } };
        window.addEventListener('mousemove', handleInteractionMove);
        window.addEventListener('mouseup', handleInteractionEnd);
        window.addEventListener('touchmove', handleInteractionMove);
        window.addEventListener('touchend', handleInteractionEnd);
    };

    const handleInteractionMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!interactionRef.current || !containerRef.current || !imageRef.current) return;
        const { type, startX, startY, startBox } = interactionRef.current;
        const { x: currentX, y: currentY } = getCoords(e);
        const dx = currentX - startX;
        const dy = currentY - startY;

        const rect = imageRef.current.getBoundingClientRect();
        const scaleX = imageSize.width / rect.width;
        const scaleY = imageSize.height / rect.height;
        
        let newBox = { ...startBox };
        const deltaX = dx * scaleX;
        const deltaY = dy * scaleY;

        if (type === 'move') {
            newBox.x = startBox.x + deltaX;
            newBox.y = startBox.y + deltaY;
        } else {
            if (type.includes('l')) {
                newBox.x = startBox.x + deltaX;
                newBox.width = startBox.width - deltaX;
            }
            if (type.includes('r')) newBox.width = startBox.width + deltaX;
            if (type.includes('t')) {
                newBox.y = startBox.y + deltaY;
                newBox.height = startBox.height - deltaY;
            }
            if (type.includes('b')) newBox.height = startBox.height + deltaY;
        }
        
        // Clamp values
        if (newBox.width < 0) {
            newBox.x += newBox.width;
            newBox.width = Math.abs(newBox.width);
        }
        if (newBox.height < 0) {
            newBox.y += newBox.height;
            newBox.height = Math.abs(newBox.height);
        }
        newBox.x = Math.max(0, Math.min(newBox.x, imageSize.width - newBox.width));
        newBox.y = Math.max(0, Math.min(newBox.y, imageSize.height - newBox.height));
        newBox.width = Math.min(newBox.width, imageSize.width - newBox.x);
        newBox.height = Math.min(newBox.height, imageSize.height - newBox.y);

        setCropBox(newBox);
    }, [imageSize]);

    const handleInteractionEnd = useCallback(() => {
        interactionRef.current = null;
        window.removeEventListener('mousemove', handleInteractionMove);
        window.removeEventListener('mouseup', handleInteractionEnd);
        window.removeEventListener('touchmove', handleInteractionMove);
        window.removeEventListener('touchend', handleInteractionEnd);
    }, [handleInteractionMove]);

    const displayScale = containerRef.current && imageRef.current ? imageRef.current.clientWidth / imageSize.width : 1;
    
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl text-white animate-fade-in-up">
                <div className="p-6 flex flex-col md:flex-row gap-6 h-[90vh] max-h-[1000px]">
                    {/* Controls */}
                    <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-4">
                        <h3 className="text-xl font-bold">Edit Image</h3>
                         <div className="flex bg-gray-700 rounded-md p-1">
                            <button onClick={() => setMode('auto')} className={`flex-1 p-2 rounded text-sm font-semibold ${mode === 'auto' ? 'bg-indigo-600' : 'hover:bg-gray-600'}`}>Auto Tools</button>
                            <button onClick={() => setMode('manual')} className={`flex-1 p-2 rounded text-sm font-semibold ${mode === 'manual' ? 'bg-indigo-600' : 'hover:bg-gray-600'}`}>Manual Crop</button>
                        </div>

                        {mode === 'auto' && (
                            <div className="space-y-3">
                                <button onClick={() => handleFlip('horizontal')} className="w-full p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex items-center justify-center gap-2"><FlipHorizontalIcon /> Flip Horizontal</button>
                                <button onClick={() => handleFlip('vertical')} className="w-full p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex items-center justify-center gap-2"><FlipVerticalIcon /> Flip Vertical</button>
                                <button onClick={() => handleAutoCrop()} className="w-full p-2 bg-gray-700 rounded-md hover:bg-gray-600 flex items-center justify-center gap-2" title="Cut Transparent BG"><CropIcon className="w-5 h-5"/> Auto-Cut</button>
                                <div className="p-2 bg-gray-700 rounded-md flex items-center justify-between">
                                    <span>Cut by Color</span>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setIsEyedropperActive(true)} title="Eyedropper"><EyedropperIcon className={isEyedropperActive ? 'text-indigo-400' : ''}/></button>
                                        <input type="color" value={cropColor} onChange={e => setCropColor(e.target.value)} className="bg-transparent w-6 h-6 p-0 border-none cursor-pointer" title="Crop Color"/>
                                        <button onClick={() => handleAutoCrop(cropColor)} className="text-sm font-semibold hover:text-indigo-300">Cut</button>
                                    </div>
                               </div>
                            </div>
                        )}
                        {mode === 'manual' && (
                            <div className="space-y-2 text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label>X:</label><input type="number" value={Math.round(cropBox.x)} onChange={e => setCropBox(b => ({...b, x: +e.target.value}))} className="w-full bg-gray-900 p-1 rounded" /></div>
                                    <div><label>Y:</label><input type="number" value={Math.round(cropBox.y)} onChange={e => setCropBox(b => ({...b, y: +e.target.value}))} className="w-full bg-gray-900 p-1 rounded" /></div>
                                    <div><label>Width:</label><input type="number" value={Math.round(cropBox.width)} onChange={e => setCropBox(b => ({...b, width: +e.target.value}))} className="w-full bg-gray-900 p-1 rounded" /></div>
                                    <div><label>Height:</label><input type="number" value={Math.round(cropBox.height)} onChange={e => setCropBox(b => ({...b, height: +e.target.value}))} className="w-full bg-gray-900 p-1 rounded" /></div>
                                </div>
                            </div>
                        )}

                        <div className="mt-auto space-y-4">
                             <div className="flex items-center gap-2 p-2 bg-gray-700 rounded-md">
                               <label htmlFor="bg-color" className="text-sm">Final BG:</label>
                               <input id="bg-color" type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="bg-transparent w-6 h-6 p-0 border-none cursor-pointer" title="Background Color for Letterboxing"/>
                               <button onClick={handleBgEyedropper} title="Pick BG Color" className="p-1 hover:bg-gray-600 rounded"><EyedropperIcon className="w-5 h-5"/></button>
                               <span className="text-xs text-gray-400 flex-1 text-right">For cell padding</span>
                           </div>
                            <div className="flex gap-2">
                                <button onClick={onClose} className="flex-1 bg-gray-600 font-semibold py-2 px-5 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                                <button onClick={handleConfirm} disabled={isLoading} className="flex-1 bg-indigo-600 font-semibold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2">
                                    {isLoading ? <LoaderIcon className="w-5 h-5"/> : <CheckIcon className="w-5 h-5"/>} Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Image Viewer */}
                    <div className="flex-1 bg-gray-900 rounded-md flex items-center justify-center overflow-hidden relative" ref={containerRef}>
                        {isLoading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"><LoaderIcon className="w-12 h-12" /></div>}
                        <img ref={imageRef} src={currentImage} alt="Image to crop" className={`max-w-full max-h-full block ${isEyedropperActive ? 'cursor-crosshair' : ''}`} onClick={handleEyedropperClick}/>
                        {mode === 'manual' && imageSize.width > 0 && (
                            <div className="absolute z-10" style={{ left: cropBox.x * displayScale, top: cropBox.y * displayScale, width: cropBox.width * displayScale, height: cropBox.height * displayScale, boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)', outline: '1px solid rgba(255,255,255,0.8)' }}>
                                <div onMouseDown={e => handleInteractionStart(e, 'move')} onTouchStart={e => handleInteractionStart(e, 'move')} className="absolute inset-0 cursor-move"></div>
                                {/* Resize Handles */}
                                <div onMouseDown={e => handleInteractionStart(e, 'tl')} onTouchStart={e => handleInteractionStart(e, 'tl')} className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize border-2 border-gray-800"></div>
                                <div onMouseDown={e => handleInteractionStart(e, 'tr')} onTouchStart={e => handleInteractionStart(e, 'tr')} className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize border-2 border-gray-800"></div>
                                <div onMouseDown={e => handleInteractionStart(e, 'bl')} onTouchStart={e => handleInteractionStart(e, 'bl')} className="absolute -bottom-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize border-2 border-gray-800"></div>
                                <div onMouseDown={e => handleInteractionStart(e, 'br')} onTouchStart={e => handleInteractionStart(e, 'br')} className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize border-2 border-gray-800"></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface CollectionDialogProps {
    collection: string[];
    onClose: () => void;
    onImageSelect: (dataUrl: string) => void;
}
const CollectionDialog: React.FC<CollectionDialogProps> = ({ collection, onClose, onImageSelect }) => {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] text-white relative animate-fade-in-up flex flex-col">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Your Collection</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <XIcon />
                    </button>
                </div>
                {collection.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-gray-400">Your collection is empty. Add or generate images!</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                            {collection.map((img, index) => (
                                <div key={index} className="relative aspect-square rounded-md overflow-hidden group cursor-pointer" onClick={() => onImageSelect(img)}>
                                    <img src={img} alt={`collection item ${index+1}`} className="w-full h-full object-cover"/>
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <CheckIcon className="w-8 h-8 text-white"/>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface SettingsDialogProps {
    width: number;
    height: number;
    padding: number;
    backgroundColor: string;
    onClose: () => void;
    onSave: (width: number, height: number, padding: number, color: string) => void;
}
const SettingsDialog: React.FC<SettingsDialogProps> = ({ width, height, padding, backgroundColor, onClose, onSave }) => {
    const [w, setW] = useState(width);
    const [h, setH] = useState(height);
    const [p, setP] = useState(padding);
    const [bgColor, setBgColor] = useState(backgroundColor);

    const handleSave = () => {
        onSave(w, h, p, bgColor);
        onClose();
    };

    const handleEyedropper = async () => {
        if (!('EyeDropper' in window)) {
            alert("Your browser doesn't support the Eyedropper API.");
            return;
        }
        try {
            // @ts-ignore - EyeDropper is not in default TS lib yet
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            setBgColor(result.sRGBHex);
        } catch (e) {
            console.log("Eyedropper was canceled.");
        }
    };


    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md text-white relative animate-fade-in-up">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors z-10"><XIcon /></button>
                <div className="p-6">
                    <h2 className="text-xl font-bold mb-4">Mixer Settings</h2>
                    <p className="text-gray-400 mb-6">Set the dimensions, padding, and background for the final mixed image.</p>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="mix-width" className="text-gray-300 font-medium w-24">Width:</label>
                            <input type="number" id="mix-width" value={w} onChange={(e) => setW(Math.max(100, parseInt(e.target.value, 10) || 0))} className="flex-1 bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none" min="100"/>
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="mix-height" className="text-gray-300 font-medium w-24">Height:</label>
                            <input type="number" id="mix-height" value={h} onChange={(e) => setH(Math.max(100, parseInt(e.target.value, 10) || 0))} className="flex-1 bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none" min="100"/>
                        </div>
                         <div className="flex items-center gap-2">
                            <label htmlFor="mix-padding" className="text-gray-300 font-medium w-24">Padding:</label>
                            <input type="number" id="mix-padding" value={p} onChange={(e) => setP(Math.max(0, parseInt(e.target.value, 10) || 0))} className="flex-1 bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none" min="0"/>
                        </div>
                         <div className="flex items-center gap-2">
                            <label htmlFor="mix-bg" className="text-gray-300 font-medium w-24">Background:</label>
                            <input type="color" id="mix-bg" value={bgColor} onChange={e => setBgColor(e.target.value)} className="p-1 h-10 w-14 block bg-gray-700 border border-gray-600 cursor-pointer rounded-md" title="Background Color"/>
                            <button onClick={handleEyedropper} title="Pick Background Color" className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"><EyedropperIcon /></button>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                        <button onClick={onClose} className="bg-gray-600 font-semibold py-2 px-5 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                        <button onClick={handleSave} className="bg-indigo-600 font-semibold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors">Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default App;