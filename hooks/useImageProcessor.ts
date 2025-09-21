import { useCallback } from 'react';
import type { GridState } from '../types';

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : null;
};


export const useImageProcessor = () => {
    const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (err) => reject(err);
            img.crossOrigin = "anonymous";
            img.src = src;
        });
    };

    const mixImages = useCallback(async (
        gridImages: GridState, 
        cols: number, 
        rows: number, 
        finalWidth: number,
        finalHeight: number,
        padding: number,
        backgroundColor: string
    ): Promise<string> => {
        const canvas = document.createElement('canvas');
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, finalWidth, finalHeight);

        const totalPaddingX = padding * (cols + 1);
        const totalPaddingY = padding * (rows + 1);

        const contentWidth = finalWidth - totalPaddingX;
        const contentHeight = finalHeight - totalPaddingY;

        if (contentWidth <= 0 || contentHeight <= 0) {
            console.warn("Padding is too large for the given dimensions. Returning a solid color background.");
            return canvas.toDataURL('image/png');
        }

        const cellWidth = contentWidth / cols;
        const cellHeight = contentHeight / rows;

        const promises: Promise<void>[] = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const imgSrc = gridImages[r][c];
                if (imgSrc) {
                    const promise = loadImage(imgSrc).then(img => {
                        const dx = padding + c * (cellWidth + padding);
                        const dy = padding + r * (cellHeight + padding);
                        ctx.drawImage(img, dx, dy, cellWidth, cellHeight);
                    }).catch(e => console.error(`Failed to load image at ${r},${c}`, e));
                    promises.push(promise);
                }
            }
        }

        await Promise.all(promises);
        return canvas.toDataURL('image/png');
    }, []);
    
    const autoCrop = useCallback(async (imageDataUrl: string, cropColorHex?: string, tolerance: number = 20): Promise<string> => {
        const img = await loadImage(imageDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const cropColor = cropColorHex ? hexToRgb(cropColorHex) : null;
        
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                let isContent = false;
                if (cropColor) {
                    const distance = Math.sqrt(Math.pow(r - cropColor.r, 2) + Math.pow(g - cropColor.g, 2) + Math.pow(b - cropColor.b, 2));
                    if (distance > tolerance && a > 0) {
                        isContent = true;
                    }
                } else {
                    if (a > 0) { // Check for non-transparent pixels
                        isContent = true;
                    }
                }
                
                if(isContent) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX === -1) { // transparent or solid color image
            return imageDataUrl;
        }

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = width;
        cropCanvas.height = height;
        const cropCtx = cropCanvas.getContext('2d');
        if(!cropCtx) throw new Error("Could not get crop canvas context");
        
        cropCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

        return cropCanvas.toDataURL('image/png');
    }, []);

    const letterboxImage = useCallback(async (
        imageDataUrl: string,
        targetAspectRatio: number,
        backgroundColor: string = '#FFFFFF'
    ): Promise<string> => {
        const img = await loadImage(imageDataUrl);

        let canvasWidth = img.width;
        let canvasHeight = img.height;

        const imgRatio = img.width / img.height;
        
        if (imgRatio > targetAspectRatio) {
             canvasHeight = img.width / targetAspectRatio;
        } else {
             canvasWidth = img.height * targetAspectRatio;
        }
        
        const canvas = document.createElement('canvas');
        const scale = Math.min(1500 / canvasWidth, 1500 / canvasHeight, 1);
        canvas.width = canvasWidth * scale;
        canvas.height = canvasHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const scaledImgWidth = img.width * scale;
        const scaledImgHeight = img.height * scale;
        const offsetX = (canvas.width - scaledImgWidth) / 2;
        const offsetY = (canvas.height - scaledImgHeight) / 2;
        
        ctx.drawImage(img, offsetX, offsetY, scaledImgWidth, scaledImgHeight);

        return canvas.toDataURL('image/png');
    }, []);

    const flipImage = useCallback(async (imageDataUrl: string, direction: 'horizontal' | 'vertical'): Promise<string> => {
        const img = await loadImage(imageDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        if (direction === 'horizontal') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        } else {
            ctx.translate(0, canvas.height);
            ctx.scale(1, -1);
        }
        
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    }, []);

    const manualCrop = useCallback(async (
        imageDataUrl: string, 
        cropBox: { x: number; y: number; width: number; height: number; }
    ): Promise<string> => {
        const img = await loadImage(imageDataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = cropBox.width;
        canvas.height = cropBox.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        
        ctx.drawImage(img, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, cropBox.width, cropBox.height);
        
        return canvas.toDataURL('image/png');
    }, []);


    return { mixImages, autoCrop, letterboxImage, flipImage, manualCrop };
};