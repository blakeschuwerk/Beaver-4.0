import { CountyAutocomplete } from './CountyAutocomplete';
import './GeographyEditor.css';

interface GeographyEditorProps {
  geography: string[];
  onAdd: (label: string) => void;
  onRemove: (label: string) => void;
  hint?: string;
}

export function GeographyEditor({ geography, onAdd, onRemove, hint }: GeographyEditorProps) {
  return (
    <div>
      <span className="geo-editor__label">Geography</span>
      <div className="geo-editor__chips">
        {geography.map((geo) => (
          <span key={geo} className="geo-editor__chip">
            {geo}
            <button type="button" aria-label={`Remove ${geo}`} onClick={() => onRemove(geo)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <CountyAutocomplete
        exclude={geography}
        onSelect={onAdd}
        placeholder="Search US counties…"
      />
      {hint && <p className="geo-editor__hint">{hint}</p>}
    </div>
  );
}
