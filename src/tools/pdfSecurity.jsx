import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, ShieldX, BadgeCheck, KeyRound, FileKey2, Download, ChevronDown, Info } from 'lucide-react'
import FileTool from '../components/FileTool'
import { Field, Segmented, Section, Toggle, Alert, Spinner, DropZone, FileList, useHandoff } from '../components/ui'
import { baseName, pdfBlob, downloadBlob } from '../lib/files'
import { loadPdf, getPdfLib, hasDigitalSignature, pageFrame } from '../lib/pdfDoc'
import { getPassword } from '../lib/passwords'
import { setHandoff } from '../lib/handoff'
import { PasswordRequiredError } from '../lib/pdf'

const PDF = 'application/pdf,.pdf'

function strength(pw) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return [['Very weak', 'bad'], ['Weak', 'bad'], ['Fair', 'mid'], ['Good', 'mid'], ['Strong', 'good'], ['Very strong', 'good']][s]
}

const randomPassword = () => {
  const a = new Uint8Array(18)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/[^A-Za-z0-9]/g, '').slice(0, 20)
}

/* ---------------- Protect ---------------- */
export function ProtectPdf() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [owner, setOwner] = useState('')
  const [print, setPrint] = useState('full')
  const [copy, setCopy] = useState(true)
  const [modify, setModify] = useState(false)
  const [annotate, setAnnotate] = useState(false)
  const [forms, setForms] = useState(true)
  const [assemble, setAssemble] = useState(false)
  const [st, cls] = strength(pw)

  return (
    <FileTool
      accept={PDF}
      modifiesPdf
      actionLabel="Protect PDF"
      disabled={!pw || pw !== pw2}
      options={
        <>
          <h3>Password protection</h3>
          <p className="muted small">Encrypted with AES-256 — the strongest standard PDF encryption. Content and quality are not changed.</p>
          <Field label="Open password">
            <div className="pw-row">
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <button className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </Field>
          {pw && <div className={`strength ${cls}`}><span style={{ width: `${Math.min(100, (pw.length / 16) * 100)}%` }} /> {st}</div>}
          <Field label="Repeat password">
            <input className="input" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          {pw2 && pw !== pw2 && <p className="warn small">Passwords do not match.</p>}
          <Section title="Permissions">
            <Field label="Printing">
              <Segmented full value={print} onChange={setPrint} options={[{ value: 'full', label: 'Allowed' }, { value: 'low', label: 'Low quality' }, { value: 'none', label: 'Not allowed' }]} />
            </Field>
            <Toggle checked={copy} onChange={setCopy} label="Allow copying text & images" />
            <Toggle checked={modify} onChange={setModify} label="Allow editing" />
            <Toggle checked={annotate} onChange={setAnnotate} label="Allow comments" />
            <Toggle checked={forms} onChange={setForms} label="Allow filling forms" />
            <Toggle checked={assemble} onChange={setAssemble} label="Allow inserting / rotating pages" />
          </Section>
          <Field label="Permissions password (optional)" hint="Needed to change the permissions later. Left empty, a random one is used so restrictions can't be lifted with the open password.">
            <input className="input" type={show ? 'text' : 'password'} value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="new-password" />
          </Field>
        </>
      }
      process={async ([file]) => {
        if (!pw) throw new Error('Enter a password.')
        if (pw !== pw2) throw new Error('The passwords do not match.')
        const { qpdfEncrypt } = await import('../lib/qpdf')
        const doc = await loadPdf(file) // decrypts first if it was already protected
        const plain = await doc.save({ useObjectStreams: true })
        const { bytes } = await qpdfEncrypt(plain, {
          userPassword: pw,
          ownerPassword: owner || randomPassword(),
          print, modify: modify ? 'all' : 'none', extract: copy, annotate, form: forms, assemble,
        })
        return { blob: pdfBlob(bytes), name: `${baseName(file.name)}-protected.pdf`, note: 'Keep your password safe — it cannot be recovered.', noteKind: 'info' }
      }}
    />
  )
}

/* ---------------- Unlock ---------------- */
const UNLOCK_MODES = [
  ['verified', 'Verified copy', 'Recommended for signed files. Replaces the signature box with a green “Digital signature verified” stamp (signer, date) and embeds the original signed PDF inside.'],
  ['attach', 'Keep signature box + attach original', 'Unlocks and embeds the original signed PDF. The old signature box stays, so readers will mark it as invalid.'],
  ['plain', 'Plain unlock', 'Only removes the password. Readers will mark the signature as invalid.'],
]

export function UnlockPdf() {
  const [files, setFiles] = useState([])
  const [sig, setSig] = useState(null) // { loading } | { list: summarize(...) } | { error }
  const [mode, setMode] = useState('verified')
  const [attach, setAttach] = useState(true)

  useEffect(() => {
    setSig(null)
    if (!files[0]) return
    let alive = true
    ;(async () => {
      if (!(await hasDigitalSignature(files[0]))) return
      if (alive) setSig({ loading: true })
      const [{ verifyPdfSignatures, describeCert }, { summarize }] = await Promise.all([import('../lib/signatureVerify'), import('../lib/signedCopy')])
      const result = await verifyPdfSignatures(new Uint8Array(await files[0].arrayBuffer()))
      if (alive) setSig({ list: summarize(result, describeCert) })
    })().catch((e) => alive && setSig({ error: e.message }))
    return () => { alive = false }
  }, [files])

  const signed = !!sig
  const allValid = !!sig?.list?.length && sig.list.every((x) => x.valid)
  useEffect(() => { if (sig?.list && !allValid) setMode((m) => (m === 'verified' ? 'attach' : m)) }, [sig, allValid])

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      actionLabel="Unlock PDF"
      disabled={!!sig?.loading}
      options={
        <>
          <h3>Unlock PDF</h3>
          <p className="muted small">Removes the password and all restrictions (printing, copying, editing). Pages are <strong>not</strong> re-rendered — quality and text stay exactly the same. You must know the password; this tool does not crack files.</p>
          {sig?.loading && <Spinner label="Checking digital signature…" />}
          {sig?.error && <Alert kind="warn">The digital signature could not be read: {sig.error}</Alert>}
          {sig?.list && (
            <>
              <Alert kind={allValid ? 'ok' : 'warn'}>
                {allValid
                  ? <>Digitally signed by <strong>{sig.list.map((x) => x.signer).join(', ')}</strong> — signature verified ✓</>
                  : 'This PDF has a digital signature that is NOT valid.'}
              </Alert>
              <Section title="Signed PDF">
                <p className="muted small">A digital signature is a fingerprint of the file's exact bytes. Unlocking must rewrite those bytes, so <strong>no tool can keep the original signature valid</strong> in an unlocked copy. Choose how the copy should handle it:</p>
                <div className="radio-cards">
                  {UNLOCK_MODES.map(([k, t, d]) => (
                    <button key={k} className={`radio-card ${mode === k ? 'active' : ''}`} disabled={k === 'verified' && !allValid} onClick={() => setMode(k)}>
                      <strong>{t}</strong><span>{d}</span>
                    </button>
                  ))}
                </div>
                {mode === 'verified' && <Toggle checked={attach} onChange={setAttach} label="Embed the original signed PDF" hint="Anyone can open it from the attachments (📎) panel to check the real signature." />}
              </Section>
            </>
          )}
        </>
      }
      process={async ([file], progress) => {
        progress('Decrypting')
        const { qpdfDecrypt } = await import('../lib/qpdf')
        const bytes = new Uint8Array(await file.arrayBuffer())
        const pw = getPassword(file) || ''
        let out
        try {
          out = await qpdfDecrypt(bytes, pw)
        } catch (e) {
          if (e.code === 'password') throw new PasswordRequiredError(file, !!pw)
          throw new Error(`This PDF could not be unlocked: ${e.message}`)
        }
        let wasEncrypted = false
        try {
          const { PDFDocument } = await getPdfLib()
          await PDFDocument.load(bytes, { updateMetadata: false })
        } catch (e) {
          wasEncrypted = /encrypt/i.test(e?.message || '')
        }
        const name = `${baseName(file.name)}-unlocked.pdf`
        const base = wasEncrypted ? 'Password and restrictions removed. Quality is unchanged.' : 'This PDF was not encrypted — it had no password or restrictions to remove.'
        if (!signed || mode === 'plain') {
          return {
            blob: pdfBlob(out.bytes), name,
            note: signed ? `${base} The digital signature will show as invalid in this copy — keep the original for official use.` : base,
            noteKind: signed ? 'warn' : wasEncrypted ? 'ok' : 'info',
          }
        }
        progress('Preparing signed copy')
        const { buildSignedUnlockCopy } = await import('../lib/signedCopy')
        const useStamp = mode === 'verified' && allValid
        const r = await buildSignedUnlockCopy(out.bytes, bytes, { name: file.name, signatures: sig?.list || [], stamp: useStamp, attach: mode === 'attach' || attach })
        const parts = [base]
        if (r.stamped) parts.push(`The signature box now shows a “Digital signature verified” stamp (${sig.list.map((x) => x.signer).join(', ')}).`)
        if (useStamp && r.invisible) parts.push('The signature had no visible box on the page, so the invalid signature was removed without adding a stamp.')
        if (r.attached) parts.push('The original signed PDF is embedded — open the attachments (📎) panel to check the real signature at any time.')
        return { blob: pdfBlob(r.bytes), name, note: parts.join(' '), noteKind: 'ok' }
      }}
    />
  )
}

/* ---------------- Verify signatures ---------------- */
const fmtDate = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function certDer(cert) {
  return new Blob([cert.node.bytes.slice(cert.node.start, cert.node.end)], { type: 'application/pkix-cert' })
}

function SignatureCard({ sig, index, describeCert }) {
  const [open, setOpen] = useState(index === 0)
  const signer = describeCert(sig.signer)
  const when = sig.timestamp?.time || sig.signingTime || sig.pdfDate
  const certOkAtSigning = signer && when ? when >= signer.notBefore && when <= signer.notAfter : null
  let status = 'bad'
  let title = 'Signature is INVALID'
  let sub = sig.error || 'The document has been altered after it was signed, or the signature is corrupt.'
  if (!sig.error && sig.integrity && sig.sigValid) {
    if (sig.coversWholeFile) {
      status = 'good'
      title = sig.isDocTimestamp ? 'Document timestamp is valid' : 'Signature is VALID'
      sub = 'The document has not been modified since it was signed, and the signature is mathematically correct.'
    } else {
      status = 'mid'
      title = 'Signature is valid — document updated later'
      sub = 'The signed version is intact, but content (often form fields, comments or further signatures) was added after signing.'
    }
  }
  const Icon = status === 'good' ? BadgeCheck : status === 'mid' ? ShieldAlert : ShieldX
  const root = sig.chain?.[sig.chain.length - 1]?.cert
  return (
    <div className={`sig-card ${status}`}>
      <button className="sig-card-head" onClick={() => setOpen(!open)}>
        <Icon size={34} className="sig-icon" />
        <div>
          <div className="sig-title">{title}</div>
          <div className="sig-sub">{signer ? <>Signed by <strong>{signer.name}</strong>{when ? ` · ${fmtDate(when)}` : ''}</> : 'Signer unknown'}</div>
        </div>
        <ChevronDown size={18} className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="sig-body">
          <p className="muted">{sub}</p>
          <ul className="check-list">
            <li className={sig.integrity ? 'ok' : 'no'}>Document integrity {sig.integrity ? '— content unchanged since signing' : '— content was modified'}</li>
            <li className={sig.sigValid ? 'ok' : 'no'}>Cryptographic signature {sig.sigValid ? `— verified (${sig.hashName}, ${signer?.keyInfo || ''})` : '— could not be verified'}</li>
            <li className={sig.coversWholeFile ? 'ok' : 'mid'}>{sig.coversWholeFile ? 'Signature covers the whole document' : 'Document has changes added after this signature'}</li>
            {certOkAtSigning !== null && <li className={certOkAtSigning ? 'ok' : 'no'}>Signer certificate {certOkAtSigning ? 'was valid at signing time' : 'was NOT valid at signing time'}</li>}
            {sig.timestamp && <li className={sig.timestamp.valid ? 'ok' : 'no'}>Trusted timestamp {sig.timestamp.authority ? `from ${sig.timestamp.authority}` : ''} {sig.timestamp.valid ? '— valid' : '— invalid'}</li>}
          </ul>
          {signer && (
            <dl className="kv-grid">
              <dt>Signer</dt><dd>{signer.name}</dd>
              {signer.org && <><dt>Organization</dt><dd>{signer.org}</dd></>}
              {signer.email && <><dt>Email</dt><dd>{signer.email}</dd></>}
              <dt>Issued by</dt><dd>{signer.issuer || '—'}{signer.selfSigned ? ' (self-signed)' : ''}</dd>
              <dt>Certificate valid</dt><dd>{fmtDate(signer.notBefore)} → {fmtDate(signer.notAfter)}</dd>
              <dt>Signed at</dt><dd>{fmtDate(when)}{sig.timestamp ? ' (timestamped)' : ''}</dd>
              {sig.reason && <><dt>Reason</dt><dd>{sig.reason}</dd></>}
              {sig.location && <><dt>Location</dt><dd>{sig.location}</dd></>}
              <dt>Format</dt><dd>{sig.subFilter || 'PKCS#7'}</dd>
            </dl>
          )}
          {sig.chain?.length > 0 && (
            <>
              <h4>Certificate chain</h4>
              <ol className="chain">
                {sig.chain.map((l, i) => {
                  const c = describeCert(l.cert)
                  return (
                    <li key={i}>
                      <span className={`dot ${l.signatureOk ? 'ok' : l.issuerPresent ? 'no' : 'mid'}`} />
                      <span className="chain-name">{c.name}</span>
                      <span className="muted small">{l.cert.selfSigned ? 'root' : l.issuerPresent ? `issued by ${c.issuer}` : `issuer "${c.issuer}" not included in file`}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadBlob(certDer(l.cert), `${c.name.replace(/[^\w.-]+/g, '_')}.cer`)}><Download size={14} /> .cer</button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
          {status !== 'bad' && root && (
            <details className="trust-help">
              <summary><Info size={16} /> Why does Adobe show a yellow “?” instead of a green tick?</summary>
              <p>The signature above is genuine. Adobe shows “Signature not verified / validity unknown” when the certificate authority that issued it (<strong>{describeCert(root).name}</strong>{root.selfSigned ? '' : ` → ${describeCert(root).issuer}`}) is not in Adobe's own trust list. Trust is a setting on <em>your computer</em> — no website can change it, and editing the PDF would break the signature. To get the green tick in Adobe Acrobat Reader:</p>
              <ol>
                <li>Open the PDF, right-click the signature and choose <strong>Show Signature Properties</strong>.</li>
                <li>Click <strong>Show Signer's Certificate…</strong>, select the <strong>top-most</strong> certificate in the chain on the left.</li>
                <li>Open the <strong>Trust</strong> tab → <strong>Add to Trusted Certificates…</strong> → OK.</li>
                <li>Tick <strong>Use this certificate as a trusted root</strong> (and “Certified documents”) → OK.</li>
                <li>Close the dialogs, right-click the signature → <strong>Validate Signature</strong>. It turns into a green tick ✔.</li>
              </ol>
              <p className="muted small">Alternative: Edit → Preferences → Signatures → Verification <em>More…</em> → under “Windows Integration” tick both boxes to trust certificates already in Windows. If the issuing certificate is missing from the file, download it above (.cer), double-click it and install it into “Trusted Root Certification Authorities”.</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export function VerifySignature() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [state, setState] = useState({ loading: false, result: null, error: '' })
  const [mod, setMod] = useState(null)
  useHandoff(PDF, setFiles)

  useEffect(() => {
    if (!files[0]) { setState({ loading: false, result: null, error: '' }); return }
    let alive = true
    setState({ loading: true, result: null, error: '' })
    ;(async () => {
      const m = await import('../lib/signatureVerify')
      const bytes = new Uint8Array(await files[0].arrayBuffer())
      const result = await m.verifyPdfSignatures(bytes)
      if (alive) { setMod(m); setState({ loading: false, result, error: '' }) }
    })().catch((e) => alive && setState({ loading: false, result: null, error: e.message }))
    return () => { alive = false }
  }, [files])

  if (!files.length) return <DropZone accept={PDF} onFiles={setFiles} label="Choose signed PDF" formats="Works with Aadhaar, DigiLocker, GST, e-Sign, DSC and Adobe-signed PDFs — even password-protected ones." />
  const sigs = state.result?.signatures || []
  const allGood = sigs.length > 0 && sigs.every((s) => !s.error && s.integrity && s.sigValid)
  return (
    <div className="verify">
      <FileList files={files} setFiles={setFiles} />
      {state.loading && <Spinner label="Checking signatures…" />}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.result && !sigs.length && <Alert kind="info">This PDF contains no digital signatures. (A drawn or typed signature image is not a digital signature.)</Alert>}
      {sigs.length > 0 && (
        <div className={`verify-summary ${allGood ? 'good' : 'bad'}`}>
          {allGood ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
          {sigs.length} signature{sigs.length > 1 ? 's' : ''} found{state.result.encrypted ? ' (verified without needing the file password)' : ''}.
        </div>
      )}
      {mod && sigs.map((s, i) => <SignatureCard key={i} sig={s} index={i} describeCert={mod.describeCert} />)}
      {allGood && state.result.encrypted && (
        <Alert kind="info">
          Need a copy without the password? <button className="btn btn-soft btn-sm" onClick={() => { setHandoff([files[0]]); navigate('/unlock-pdf') }}>Create a verified unlocked copy</button>
          <div className="small">It carries a “Digital signature verified” stamp and embeds this original, so the real signature can always be checked.</div>
        </Alert>
      )}
      <button className="btn btn-ghost" onClick={() => setFiles([])}>Check another PDF</button>
    </div>
  )
}

/* ---------------- Digital signature (certificate) ---------------- */
export function DigitalSignPdf() {
  const [certMode, setCertMode] = useState('upload')
  const [certFile, setCertFile] = useState(null)
  const [certPw, setCertPw] = useState('')
  const [cred, setCred] = useState(null)
  const [certErr, setCertErr] = useState('')
  const [newCert, setNewCert] = useState({ name: '', email: '', org: '', country: 'IN', password: '' })
  const [creating, setCreating] = useState(false)
  const [reason, setReason] = useState('I approve this document')
  const [location, setLocation] = useState('')
  const [visible, setVisible] = useState(true)
  const [where, setWhere] = useState('last-br')
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [force, setForce] = useState(false)
  const [files, setFiles] = useState([])

  useEffect(() => {
    setForce(false)
    if (files[0]) hasDigitalSignature(files[0]).then(setAlreadySigned)
    else setAlreadySigned(false)
  }, [files])

  const openCert = async () => {
    setCertErr('')
    try {
      const { readP12 } = await import('../lib/signatureCreate')
      setCred(await readP12(await certFile.arrayBuffer(), certPw))
    } catch (e) { setCred(null); setCertErr(e.message) }
  }
  const create = async () => {
    setCertErr('')
    if (!newCert.name.trim()) { setCertErr('Enter your name.'); return }
    if (newCert.password.length < 4) { setCertErr('Choose a password of at least 4 characters to protect your certificate file.'); return }
    setCreating(true)
    try {
      const { createSelfSignedP12, readP12 } = await import('../lib/signatureCreate')
      const p12 = await createSelfSignedP12(newCert)
      downloadBlob(new Blob([p12], { type: 'application/x-pkcs12' }), `${newCert.name.replace(/[^\w.-]+/g, '_')}-certificate.p12`)
      setCred(await readP12(p12, newCert.password))
    } catch (e) { setCertErr(e.message) }
    setCreating(false)
  }

  const blocked = alreadySigned && !force

  return (
    <FileTool
      files={files}
      setFiles={setFiles}
      accept={PDF}
      actionLabel="Digitally sign PDF"
      disabled={!cred || blocked}
      options={
        <>
          <h3>Digital signature</h3>
          <p className="muted small">A cryptographic signature (PAdES / PKCS#7) that proves who signed and that nothing changed afterwards. Readers like Adobe Acrobat show it in the Signatures panel.</p>
          {alreadySigned && (
            <Alert kind="warn">
              This PDF is already digitally signed. Adding another signature here rewrites the file and <strong>invalidates the existing signature</strong>.
              <Toggle checked={force} onChange={setForce} label="I understand — sign anyway" />
            </Alert>
          )}
          <Section title="1. Your certificate">
            <Segmented full value={certMode} onChange={(v) => { setCertMode(v); setCertErr('') }} options={[{ value: 'upload', label: 'Use my .p12 / .pfx' }, { value: 'create', label: 'Create new' }]} />
            {cred ? (
              <div className="cert-card">
                <FileKey2 size={22} />
                <div>
                  <strong>{cred.info.name}</strong>
                  <div className="muted small">{cred.info.selfSigned ? 'Self-signed certificate' : `Issued by ${cred.info.issuer}`} · valid until {cred.info.notAfter.toLocaleDateString()}</div>
                  {cred.info.notAfter < new Date() && <div className="warn small">This certificate has expired.</div>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setCred(null)}>Change</button>
              </div>
            ) : certMode === 'upload' ? (
              <>
                <Field label="Certificate file (.p12 / .pfx)"><input className="input" type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setCertFile(e.target.files[0] || null)} /></Field>
                <Field label="Certificate password"><input className="input" type="password" value={certPw} onChange={(e) => setCertPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && certFile && openCert()} /></Field>
                <button className="btn btn-soft btn-block" disabled={!certFile} onClick={openCert}><KeyRound size={16} /> Load certificate</button>
                <p className="muted small">USB-token certificates (e.g. Class 3 DSC) can't be read by any website for security reasons — use your token vendor's signing app for those.</p>
              </>
            ) : (
              <>
                <Field label="Full name"><input className="input" value={newCert.name} onChange={(e) => setNewCert({ ...newCert, name: e.target.value })} /></Field>
                <div className="grid-2">
                  <Field label="Email"><input className="input" value={newCert.email} onChange={(e) => setNewCert({ ...newCert, email: e.target.value })} /></Field>
                  <Field label="Country"><input className="input" maxLength={2} value={newCert.country} onChange={(e) => setNewCert({ ...newCert, country: e.target.value.toUpperCase() })} /></Field>
                </div>
                <Field label="Organization (optional)"><input className="input" value={newCert.org} onChange={(e) => setNewCert({ ...newCert, org: e.target.value })} /></Field>
                <Field label="Password for your certificate file" hint="Your new certificate is downloaded as a .p12 file so you can sign again later."><input className="input" type="password" value={newCert.password} onChange={(e) => setNewCert({ ...newCert, password: e.target.value })} /></Field>
                <button className="btn btn-soft btn-block" disabled={creating} onClick={create}><KeyRound size={16} /> {creating ? 'Creating…' : 'Create certificate'}</button>
                <p className="muted small">Self-signed certificates prove the document wasn't changed. Readers will say the signer's identity is unverified until the recipient trusts your certificate. For legally recognised signatures use a certificate from a licensed authority.</p>
              </>
            )}
            {certErr && <Alert kind="error">{certErr}</Alert>}
          </Section>
          <Section title="2. Details">
            <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Field label="Location"><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" /></Field>
          </Section>
          <Section title="3. Appearance">
            <Toggle checked={visible} onChange={setVisible} label="Show a signature stamp on the page" />
            {visible && (
              <Segmented full value={where} onChange={setWhere} options={[{ value: 'last-br', label: 'Last page' }, { value: 'first-br', label: 'First page' }, { value: 'all-br', label: 'Every page' }]} />
            )}
          </Section>
        </>
      }
      process={async ([file], progress) => {
        if (!cred) throw new Error('Load or create a certificate first.')
        progress('Preparing document')
        const doc = await loadPdf(file)
        const { StandardFonts, rgb, degrees } = await getPdfLib()
        const { signPdf } = await import('../lib/signatureCreate')
        const pages = doc.getPages()
        const now = new Date()
        let appearance
        if (visible) {
          const font = await doc.embedFont(StandardFonts.Helvetica)
          const bold = await doc.embedFont(StandardFonts.HelveticaBold)
          const safe = (s) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
          const lines = [
            [bold, `Digitally signed by ${safe(cred.info.name)}`],
            [font, `Date: ${now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`],
            ...(reason ? [[font, `Reason: ${safe(reason)}`]] : []),
            ...(location ? [[font, `Location: ${safe(location)}`]] : []),
          ]
          const size = 7.5
          const w = Math.max(...lines.map(([f, t]) => f.widthOfTextAtSize(t, size))) + 30
          const h = lines.length * size * 1.35 + 12
          const stampOn = (page) => {
            const fr = pageFrame(page)
            const vx = fr.vw - w - 24
            const vy = fr.vh - h - 24
            const rot = degrees(fr.rot)
            const a = fr.map(vx, vy + h)
            page.drawRectangle({ x: a.x, y: a.y, width: w, height: h, rotate: rot, borderColor: rgb(0.1, 0.5, 0.25), borderWidth: 0.8, color: rgb(0.93, 0.98, 0.94), opacity: 0.95 })
            // green tick
            const t1 = fr.map(vx + 7, vy + h / 2)
            const t2 = fr.map(vx + 11, vy + h / 2 + 4)
            const t3 = fr.map(vx + 18, vy + h / 2 - 6)
            page.drawLine({ start: t1, end: t2, thickness: 1.8, color: rgb(0.1, 0.55, 0.25) })
            page.drawLine({ start: t2, end: t3, thickness: 1.8, color: rgb(0.1, 0.55, 0.25) })
            lines.forEach(([f, t], i) => {
              const p = fr.map(vx + 24, vy + 6 + (i + 1) * size * 1.35 - 2)
              page.drawText(t, { x: p.x, y: p.y, size, font: f, color: rgb(0.1, 0.2, 0.15), rotate: rot })
            })
          }
          const target = where.startsWith('first') ? 0 : pages.length - 1
          appearance = {
            pageIndex: target,
            draw: async () => {
              const list = where.startsWith('all') ? pages : [pages[target]]
              list.forEach(stampOn)
            },
          }
        }
        progress('Signing')
        const signed = await signPdf(doc, cred, { reason, location, name: cred.info.name, appearance })
        // Self-check: verify what we produced.
        const { verifyPdfSignatures } = await import('../lib/signatureVerify')
        const check = await verifyPdfSignatures(signed)
        const mine = check.signatures[check.signatures.length - 1]
        const ok = mine && mine.integrity && mine.sigValid
        return {
          blob: pdfBlob(signed),
          name: `${baseName(file.name)}-signed.pdf`,
          note: ok ? `Signed and verified ✔ — signed by ${cred.info.name}. ${cred.info.selfSigned ? 'Because the certificate is self-signed, Adobe will show “validity unknown” until the recipient trusts it.' : ''}` : 'Signed, but the self-check could not verify the result.',
          noteKind: ok ? 'ok' : 'warn',
        }
      }}
    />
  )
}

