import {useEffect, useRef, useState} from 'react';
import {Building2, Check, LoaderCircle} from 'lucide-react';
import {defaultFields, validateBusinessDefaults, type BusinessDefaults} from './business-defaults';
import {useLanguage, useTranslation} from './LanguageContext';

type Props = {value: BusinessDefaults; pendingCount: number; onSave: (value: BusinessDefaults) => Promise<void>; onFillPending: () => Promise<void>};
export function BusinessDefaultsSettings({value, pendingCount, onSave, onFillPending}: Props) {
  const t = useTranslation(), language = useLanguage();
  const [draft, setDraft] = useState(value), [saving, setSaving] = useState(false), [problem, setProblem] = useState('');
  const snapshot = JSON.stringify(value);
  const previousSnapshot=useRef(snapshot);
  useEffect(() => {
    const previous=previousSnapshot.current;previousSnapshot.current=snapshot;
    // A rejected optimistic save must leave the user's unsaved form intact.
    setDraft(current=>!saving&&JSON.stringify(current)===previous?JSON.parse(snapshot):current);
  }, [snapshot]);
  const changed = JSON.stringify(draft) !== snapshot;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setProblem('');
    try { validateBusinessDefaults(draft); await onSave(draft); }
    catch { setProblem(t('Could not save fixed details. Please try again.')); }
    finally { setSaving(false); }
  }
  return <section className="business-defaults backup-card" data-testid="business-defaults">
    <div className="defaults-heading"><Building2 size={29}/><div><h2>{t('Fixed document details')}</h2><p>{t('Save the company and delivery details you use repeatedly.')}</p></div></div>
    <form onSubmit={event => void save(event)}>
      <label className="check-row"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({...draft, enabled: event.target.checked})}/>{t('Use these details for new documents')}</label>
      <p className="defaults-help">{t('Only empty fields are filled. Details read from photos and existing archive records are kept.')}</p>
      <p className="defaults-help">{t('Tax IDs and addresses apply only to the matching company.')}</p>
      <div className="form-grid">
        {defaultFields.map(([key, label]) => <label className={`field ${key === 'notes' ? 'wide' : ''}`} key={key}><span>{t(label)}</span>{key.endsWith('Address') || key === 'notes'
          ? <textarea lang={language} aria-label={t(label)} data-testid={`default-${key}`} maxLength={2000} rows={2} value={draft[key]} onChange={event => setDraft({...draft, [key]: event.target.value})}/>
          : <input lang={language} aria-label={t(label)} data-testid={`default-${key}`} maxLength={2000} value={draft[key]} onChange={event => setDraft({...draft, [key]: event.target.value})}/>}</label>)}
        <label className="field"><span>{t('Default currency')}</span><select aria-label={t('Default currency')} data-testid="default-currency" value={draft.currency} onChange={event => setDraft({...draft, currency: event.target.value})}><option value="">{t('Use the currency in the photo')}</option>{['TRY','CZK','EUR','USD','GBP'].map(currency => <option key={currency}>{currency}</option>)}</select></label>
      </div>
      {problem && <p className="field-error" role="alert">{problem}</p>}
      <div className="defaults-actions"><button type="submit" className="primary" disabled={saving || !changed} data-testid="save-defaults">{saving ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>} {t('Save fixed details')}</button>
        {pendingCount > 0 && <button type="button" className="secondary" disabled={saving || changed || !draft.enabled} onClick={() => {setSaving(true); setProblem(''); void onFillPending().catch(() => setProblem(t('Could not save fixed details. Please try again.'))).finally(() => setSaving(false));}}>{t('Fill empty fields in pending documents')}</button>}
      </div>
    </form>
  </section>;
}
