export interface ParsedFile { name: string; type: string; content: string; size: number }

const readText = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsText(file);
  });

const readPdf = async (file: File): Promise<string> => {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((x: any) => x.str).join(" "));
  }
  return pages.join("\n\n");
};

export const parseFile = async (file: File): Promise<ParsedFile> => {
  const MB = file.size / (1024 * 1024);
  if (MB > 20) throw new Error("File too large (max 20MB)");

  let content = "";
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    content = await readPdf(file);
  } else if (file.type.startsWith("text/") || /\.(txt|md|csv|json|js|ts|py|html|css)$/i.test(file.name)) {
    content = await readText(file);
  } else {
    throw new Error("Unsupported file type. Use PDF, TXT, MD, CSV, or code files.");
  }

  if (!content.trim()) throw new Error("File appears to be empty or unreadable.");
  return { name: file.name, type: file.type, content: content.slice(0, 40000), size: file.size };
};
