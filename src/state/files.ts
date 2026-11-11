const JSON_TYPE = 'application/json';

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

/** Saves text as a file through the browser's normal download. */
export function downloadTextFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: JSON_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Whether the device's share sheet accepts files (most phones; lets a backup go to cloud storage). */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'backup.json', { type: JSON_TYPE })] })
    );
  } catch {
    return false;
  }
}

/** Opens the share sheet with the file. Resolves false when the person backs out. */
export async function shareTextFile(name: string, text: string, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([text], name, { type: JSON_TYPE })], title });
    return true;
  } catch {
    return false;
  }
}
