export default function Privacy() {
  return (
    <div className="page-narrow prose">
      <h1>Privacy</h1>
      <p><strong>tools.aicraftalchemy</strong> is built by aicraftalchemy around one rule: <strong>your files are yours</strong>.</p>
      <h2>No uploads</h2>
      <p>Every conversion, compression, edit and signature runs inside your web browser using JavaScript and WebAssembly. Your files are never sent to a server — there is no server that could receive them.</p>
      <h2>No storage</h2>
      <p>We do not store, log or keep copies of your files, passwords or certificates. Results exist only in your tab's memory and disappear when you close or refresh it.</p>
      <h2>Downloaded engines</h2>
      <p>OCR and video/audio tools download their processing engines (Tesseract language data, FFmpeg) from the public jsDelivr CDN on first use. Only the engine is downloaded; nothing about your files is sent.</p>
      <h2>No accounts, no tracking</h2>
      <p>There is no sign-up and no analytics or advertising scripts. The only thing saved on your device is your light/dark theme choice. Fonts are loaded from Google Fonts.</p>
    </div>
  )
}
