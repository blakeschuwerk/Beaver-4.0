import { useEffect, useRef, useState } from 'react';
import { isValidUSCounty, searchUSCounties } from '../lib/usCounties';
import './CountyAutocomplete.css';

interface CountyAutocompleteProps {
  onSelect: (label: string) => void;
  exclude?: string[];
  placeholder?: string;
  buttonLabel?: string;
  /** Search function — defaults to all US counties. Pass a scoped one (e.g. verified-only). */
  search?: (query: string, limit?: number) => string[];
  /** Validity check — defaults to all US counties. Must agree with `search`. */
  isValid?: (label: string) => boolean;
}

export function CountyAutocomplete({
  onSelect,
  exclude = [],
  placeholder = 'Search US counties…',
  buttonLabel = 'Add',
  search = searchUSCounties,
  isValid = isValidUSCounty,
}: CountyAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (selected) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const results = search(query, 10).filter((c) => !exclude.includes(c));
    setSuggestions(results);
    setActiveIndex(0);
    setOpen(query.length > 0 && results.length > 0);
  }, [query, selected, exclude]);

  function pick(label: string) {
    setSelected(label);
    setQuery(label);
    setError(null);
    setOpen(false);
  }

  function handleSubmit() {
    if (selected && isValid(selected)) {
      onSelect(selected);
      setQuery('');
      setSelected(null);
      setError(null);
      return;
    }
    if (query.trim() && isValid(query.trim()) && !exclude.includes(query.trim())) {
      onSelect(query.trim());
      setQuery('');
      setSelected(null);
      setError(null);
      return;
    }
    setError('Pick a county from the list');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && suggestions[activeIndex]) {
        pick(suggestions[activeIndex]);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="county-autocomplete" ref={ref}>
      <div className="county-autocomplete__row">
        <div className="county-autocomplete__input-wrap">
          <input
            className={`county-autocomplete__input${selected ? ' county-autocomplete__input--selected' : ''}`}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setError(null);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {open && suggestions.length > 0 && (
            <div className="county-autocomplete__panel">
              {suggestions.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`county-autocomplete__option${
                    index === activeIndex ? ' county-autocomplete__option--active' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="county-autocomplete__add"
          disabled={!selected && !isValid(query.trim())}
          onClick={handleSubmit}
        >
          {buttonLabel}
        </button>
      </div>
      {error && <p className="county-autocomplete__error">{error}</p>}
      {!error && !selected && query.length > 0 && suggestions.length === 0 && (
        <p className="county-autocomplete__hint">No matching US counties</p>
      )}
    </div>
  );
}
