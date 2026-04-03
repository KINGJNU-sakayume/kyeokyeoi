export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function estimateStorageMB(photos: string[]): number {
  const totalChars = photos.reduce((sum, p) => sum + p.length, 0);
  return (totalChars * 0.75) / (1024 * 1024);
}
