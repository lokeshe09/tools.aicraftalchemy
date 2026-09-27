// OCR with Tesseract (WebAssembly). The recognition engine and language model are downloaded
// from a public CDN on first use and cached by the browser; images are processed locally.
export const OCR_LANGS = [
  ['eng', 'English'], ['hin', 'Hindi'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['kan', 'Kannada'], ['mal', 'Malayalam'],
  ['ben', 'Bengali'], ['mar', 'Marathi'], ['guj', 'Gujarati'], ['pan', 'Punjabi'], ['urd', 'Urdu'], ['ara', 'Arabic'],
  ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['rus', 'Russian'],
  ['chi_sim', 'Chinese (Simplified)'], ['jpn', 'Japanese'], ['kor', 'Korean'],
]

export async function createOcr(langs, progress) {
  const { createWorker } = await import('tesseract.js')
  let label = 'Preparing OCR'
  const worker = await createWorker(langs, 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') progress?.(`${label} ${Math.round((m.progress || 0) * 100)}%`)
      else if (/loading|initializ/i.test(m.status)) progress?.('Loading OCR language data…')
    },
  })
  return {
    async recognize(image, { pdf = false, page } = {}) {
      label = page ? `Reading page ${page}…` : 'Reading text…'
      const { data } = await worker.recognize(image, {}, { text: true, pdf })
      return data
    },
    terminate: () => worker.terminate(),
  }
}
