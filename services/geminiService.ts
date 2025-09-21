import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64.split(',')[1],
      mimeType
    },
  };
};

export const enhancePrompt = async (prompt: string): Promise<string> => {
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Enhance this user's prompt for an AI image generator to be more descriptive, vivid, and detailed. Return only the enhanced prompt. Original prompt: "${prompt}"`,
            config: {
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error enhancing prompt:", error);
        return prompt; // Fallback to original prompt on error
    }
};

export const generateImage = async (
    prompt: string,
    aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9',
    referenceImage?: { base64: string, mimeType: string }
): Promise<string> => {
    try {
        if (referenceImage) {
            const imagePart = fileToGenerativePart(referenceImage.base64, referenceImage.mimeType);
            const textPart = { text: `Generate an image inspired by the reference image, matching this prompt. The final image should have an aspect ratio of ${aspectRatio}. Prompt: ${prompt}` };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [textPart, imagePart] },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
                }
            }
            throw new Error("Image generation with reference failed: No image part in response.");

        } else {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: aspectRatio,
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
                return `data:image/png;base64,${base64ImageBytes}`;
            }
            throw new Error("No image generated.");
        }
    } catch (error) {
        console.error("Error generating image:", error);
        throw error;
    }
};

export const generateVideoFromImage = async (
    prompt: string,
    image: { base64: string, mimeType: string },
    model: string,
    onProgress: (message: string) => void
): Promise<string> => {
    try {
        const base64Data = image.base64.split(',')[1];
        if (!base64Data) {
            throw new Error("Invalid base64 image data");
        }

        onProgress("Starting video generation...");
        let operation = await ai.models.generateVideos({
            model: model,
            prompt: prompt,
            image: {
                imageBytes: base64Data,
                mimeType: image.mimeType,
            },
            config: {
                numberOfVideos: 1
            }
        });

        onProgress("Video processing started. This may take a few minutes...");
        let pollCount = 0;
        const messages = [
            "Analyzing image and prompt...",
            "Composing video scenes...",
            "Rendering frames...",
            "Adding final touches...",
            "Almost there..."
        ];

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            onProgress(messages[pollCount % messages.length]);
            pollCount++;
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }
        
        if (operation.error) {
            const errorMessage = (operation.error as any).message || JSON.stringify(operation.error);
            console.error("Video generation operation failed with an error:", operation.error);
            throw new Error(`Video generation failed: ${errorMessage}`);
        }
        
        onProgress("Finalizing video...");

        const generatedVideos = operation.response?.generatedVideos;
        
        if (!generatedVideos || generatedVideos.length === 0) {
            const responseForError = JSON.stringify(operation.response ?? operation, null, 2);
            console.error("Video generation completed, but the response did not contain any videos:", responseForError);
            throw new Error(`Video generation failed: The API returned an empty or invalid response. Full response: ${responseForError}`);
        }

        const downloadLink = generatedVideos[0]?.video?.uri;
        if (!downloadLink) {
            const videoDataForError = JSON.stringify(generatedVideos[0], null, 2);
            console.error("A video object was returned, but it did not contain a download link:", videoDataForError);
            throw new Error(`Video generation failed: No download link was provided for the generated video. Video data: ${videoDataForError}`);
        }
        
        onProgress("Downloading video...");
        // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            throw new Error(`Failed to download video: ${response.statusText}`);
        }
        
        const videoBlob = await response.blob();
        const videoUrl = URL.createObjectURL(videoBlob);
        
        return videoUrl;

    } catch (error) {
        console.error("Error generating video:", error);
        throw error;
    }
};